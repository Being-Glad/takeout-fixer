const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { exiftool } = require('exiftool-vendored');

let mainWindow;

// Fix for spaces in app name affecting exiftool config
const appName = app.getName().replace(/\s/g, '-');
const exiftoolConfig = path.join(os.tmpdir(), `${appName}-exiftool.config`);

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 900,
        minHeight: 700,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        // Use nativeImage for robust icon loading (fixes Mac crash)
        icon: nativeImage.createFromPath(path.join(__dirname, 'build/icon.png'))
    });

    // Hide menu bar on Windows/Linux for a cleaner, native feel
    if (process.platform !== 'darwin') {
        mainWindow.setMenuBarVisibility(false);
    }

    // Force Dock icon on macOS (fixes missing icon in dev mode)
    if (process.platform === 'darwin') {
        app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'build/icon.png')));
    }

    mainWindow.loadFile('app.html');
}

app.whenReady().then(createWindow);

// Fix for macOS: Re-create window if dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Fix for macOS: Don't quit the app when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---
ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections', 'openFile']
    });
    if (canceled) return null;
    return filePaths;
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('get-platform', () => process.platform);

ipcMain.on('start-processing', async (event, paths) => {
    await processFiles(paths);
});

// --- Core Logic ---
async function processFiles(paths) {
    let mediaFiles = [];
    let jsonFiles = new Map();

    async function scan(currentPath) {
        try {
            const stats = await fs.stat(currentPath);
            if (stats.isDirectory()) {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });
                for (const entry of entries) {
                    await scan(path.join(currentPath, entry.name));
                }
            } else {
                const ext = path.extname(currentPath).toLowerCase();
                if (ext === '.json') {
                    jsonFiles.set(normalizePath(currentPath), currentPath);
                } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tiff', '.mov', '.mp4', '.avi', '.mkv', '.3gp'].includes(ext)) {
                    mediaFiles.push(currentPath);
                }
            }
        } catch (e) {
            mainWindow.webContents.send('add-log', `Skipping: ${currentPath} (Error: ${e.message})`, 'warn');
        }
    }

    try {
        mainWindow.webContents.send('add-log', `Scanning selected paths...`);
        for (const p of paths) {
            await scan(p);
        }
        mainWindow.webContents.send('add-log', `Found ${mediaFiles.length} media files and ${jsonFiles.size} JSON files.`);

        let fixedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < mediaFiles.length; i++) {
            const mediaPath = mediaFiles[i];
            const progress = i + 1;
            mainWindow.webContents.send('update-progress', progress, mediaFiles.length);

            let key = normalizePath(mediaPath);
            let jsonPath = jsonFiles.get(key);
            
            // Handle Google's '(1).jpg' vs '.jpg(1).json' mismatch
            if (!jsonPath && key.match(/\(\d+\)$/)) {
                 jsonPath = jsonFiles.get(key.replace(/(\(\d+\))$/, ''));
            }

            // Handle edited file mismatch (e.g. file.mp4 -> file-edited.mp4)
            if (!jsonPath) {
                const editedKey = key.replace(/-edited$/i, '').replace(/_edited$/i, '');
                jsonPath = jsonFiles.get(editedKey);
            }
            
            // Handle extension mismatch (e.g. file.jpeg -> file.jpg.json)
            if (!jsonPath) {
                 const baseKey = key.substring(0, key.lastIndexOf('.'));
                 if(jsonFiles.has(baseKey)) {
                    jsonPath = jsonFiles.get(baseKey);
                 }
            }


            let timestamp = null;
            let gps = null;
            let description = null;
            let dateSource = 'skipped';

            // 1. Try finding data in JSON
            if (jsonPath) {
                try {
                    const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
                    timestamp = data.photoTakenTime?.timestamp || data.creationTime?.timestamp;
                    gps = data.geoData;
                    description = data.description;
                    if (timestamp) dateSource = 'JSON';
                } catch (e) {
                    mainWindow.webContents.send('add-log', `Error parsing JSON for: ${path.basename(mediaPath)}`, 'warn');
                }
            }

            // 2. Smart Fallback: If no JSON date, try filename
            if (!timestamp) {
                const filenameDate = parseTimestampFromFilename(path.basename(mediaPath));
                if (filenameDate) {
                    timestamp = Math.floor(filenameDate.getTime() / 1000);
                    dateSource = 'Filename';
                }
            }

            // 3. If we found a date (from JSON OR filename), fix the file
            if (timestamp) {
                const dateObj = new Date(timestamp * 1000);
                const dateStr = dateObj.toISOString().replace(/T/, ' ').replace(/\..+/, '');

                const tags = {
                    AllDates: dateStr,
                    FileModifyDate: dateStr,
                    FileCreateDate: dateStr
                };

                // Only add GPS/Description if we found them (likely from JSON)
                if (dateSource === 'JSON') {
                    if (gps && gps.latitude !== 0 && gps.longitude !== 0) {
                        tags.GPSLatitude = gps.latitude;
                        tags.GPSLongitude = gps.longitude;
                        tags.GPSAltitude = gps.altitude;
                    }
                    if (description) {
                        tags.ImageDescription = description;
                        tags['Caption-Abstract'] = description;
                        tags.Title = description;
                    }
                }
                
                // Log before heavy operation
                const stats = await fs.stat(mediaPath);
                if (stats.size > 100 * 1024 * 1024) { // > 100MB
                     mainWindow.webContents.send('add-log', `Processing large file: ${path.basename(mediaPath)}...`);
                }

                try {
                    await exiftool.write(mediaPath, tags, {
                        writeArgs: ['-overwrite_original'],
                        taskEnv: { ExifTool_Config: exiftoolConfig },
                        readArgs: [`-config ${exiftoolConfig}`],
                        writeTimeoutMillis: 120000 // 2-minute timeout for huge files
                    });
                    fixedCount++;
                } catch (e) {
                    mainWindow.webContents.send('add-log', `ExifTool error for ${path.basename(mediaPath)}: ${e.message}`, 'error');
                    skippedCount++;
                }
            } else {
                mainWindow.webContents.send('add-log', `No date found for: ${path.basename(mediaPath)}`, 'warn');
                skippedCount++;
            }
        }

        mainWindow.webContents.send('processing-complete', { fixed: fixedCount, skipped: skippedCount });

    } catch (err) {
        mainWindow.webContents.send('add-log', `Fatal Error: ${err.message}`, 'error');
    } finally {
        exiftool.end();
    }
}

function normalizePath(p) {
    let key = p.toLowerCase();
    
    // Get base path without extension
    const ext = path.extname(key);
    if(ext) {
        key = key.substring(0, key.length - ext.length);
    }

    // Strip .json if it's there
    key = key.replace(/\.json$/, '');
    
    // Strip common Google Photos suffixes
    key = key.replace(/(\(\d+\))$/, '') // (1), (2), etc.
        .replace(/-edited$/, '')
        .replace(/_edited$/, '')
        .replace(/-collage$/, '')
        .replace(/-animation$/, '')
        .replace(/-effects$/, '')
        .replace(/-cinematic$/, '')
        .replace(/\.supplemental-metadata$/, '')
        .trim();
        
    return key;
}

function parseTimestampFromFilename(filename) {
    // Matches YYYYMMDD_HHMMSS or YYYY-MM-DD HH-MM-SS
    let m = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_ \.]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
    if (m) {
        const d = new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]));
        if (!isNaN(d.getTime())) return d;
    }
    
    // Matches IMG-YYYYMMDD-WA0001
    m = filename.match(/IMG-(\d{4})(\d{2})(\d{2})-WA\d+/i);
     if (m) {
        const d = new Date(Date.UTC(m[1], m[2] - 1, m[3], 12, 0, 0)); // Default to noon
        if (!isNaN(d.getTime())) return d;
    }

    // Matches YYYYMMDD (date only)
    m = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    if (m) {
        const d = new Date(Date.UTC(m[1], m[2] - 1, m[3], 12, 0, 0)); // Default to noon
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}