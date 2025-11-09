const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
// Use exiftool-vendored, which includes the binary
const exiftool = require('exiftool-vendored').exiftool;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset', // Native-looking header on Mac
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        // Explicitly set icon for dev mode (especially helpful on Linux/Win)
        icon: path.join(__dirname, 'build', 'icon.png')
    });

    // Hide menu bar on Windows/Linux for a cleaner, native feel
    if (process.platform !== 'darwin') {
        mainWindow.setMenuBarVisibility(false);
    }
    
    // Force Dock icon on macOS (fixes missing icon in dev mode)
    if (process.platform === 'darwin') {
        app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
    }

    mainWindow.loadFile('app.html');
}

app.whenReady().then(createWindow);

// Standard macOS behavior: Re-create window if dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---
ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return filePaths[0];
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('get-platform', () => process.platform);

ipcMain.on('start-processing', async (event, inputPath) => {
    processFiles(inputPath);
});

// --- Core Logic ---
async function processFiles(dirPath) {
    let mediaFiles = [];
    let jsonFiles = new Map();

    async function scanDir(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (ext === '.json') {
                    jsonFiles.set(normalizePath(fullPath), fullPath);
                } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tiff', '.mov', '.mp4', '.avi', '.mkv', '.3gp'].includes(ext)) {
                    mediaFiles.push(fullPath);
                }
            }
        }
    }

    try {
        mainWindow.webContents.send('add-log', `Scanning folder: ${dirPath}...`);
        await scanDir(dirPath);
        mainWindow.webContents.send('add-log', `Found ${mediaFiles.length} media files and ${jsonFiles.size} JSON files.`);

        let fixedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < mediaFiles.length; i++) {
            const mediaPath = mediaFiles[i];
            const progress = i + 1;
            
            // Send progress update to UI
            mainWindow.webContents.send('update-progress', progress, mediaFiles.length);

            let key = normalizePath(mediaPath);
            let jsonPath = jsonFiles.get(key);

            if (!jsonPath) {
                // Try without extension (common Google Photos pattern)
                const baseKey = key.substring(0, key.lastIndexOf('.'));
                jsonPath = jsonFiles.get(baseKey);
            }

            let timestamp = null;
            let gps = null;
            let description = null;

            // 1. Try finding data in JSON
            if (jsonPath) {
                try {
                    const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
                    timestamp = data.photoTakenTime?.timestamp || data.creationTime?.timestamp;
                    gps = data.geoData;
                    description = data.description;
                } catch (e) {
                    mainWindow.webContents.send('add-log', `Error parsing JSON for: ${path.basename(mediaPath)}`, 'warn');
                }
            }

            // 2. Smart Fallback: If no JSON date, try filename
            if (!timestamp) {
                timestamp = parseTimestampFromFilename(path.basename(mediaPath));
                 if (timestamp) {
                    // Convert MS timestamp back to seconds for consistency if needed, 
                    // but ExifTool prefers standard date strings.
                    // Actually, let's keep it as null here and handle it below.
                     mainWindow.webContents.send('add-log', `Found date in filename for: ${path.basename(mediaPath)}`, 'info');
                } else {
                     mainWindow.webContents.send('add-log', `No JSON found for: ${path.basename(mediaPath)}`, 'warn');
                }
            }

            // 3. If we found a date (from JSON OR filename), fix the file
            if (timestamp) {
                // Convert timestamp to ExifTool-friendly format
                // Handle both seconds (JSON) and milliseconds (Filename regex)
                const dateObj = new Date(timestamp > 100000000000 ? timestamp : timestamp * 1000);
                const dateStr = dateObj.toISOString().replace(/T/, ' ').replace(/\..+/, '');

                const tags = {
                    AllDates: dateStr,
                    FileModifyDate: dateStr,
                    FileCreateDate: dateStr
                };

                if (gps && gps.latitude !== 0 && gps.longitude !== 0) {
                    tags.GPSLatitude = gps.latitude;
                    tags.GPSLongitude = gps.longitude;
                    tags.GPSAltitude = gps.altitude;
                }
                if (description) {
                    tags.ImageDescription = description;
                    tags['Caption-Abstract'] = description;
                }
                
                 // Log *before* starting heavy ExifTool operation so UI doesn't feel stuck on large files
                if (fs.stat(mediaPath).then(s => s.size > 100 * 1024 * 1024)) { // > 100MB
                     mainWindow.webContents.send('add-log', `Processing large file: ${path.basename(mediaPath)}...`);
                }

                try {
                    // Ensure we use a config file that doesn't have spaces to avoid issues
                    // We don't need a specific config here, standard write works.
                    await exiftool.write(mediaPath, tags, { writeArgs: ['-overwrite_original'] });
                    fixedCount++;
                } catch (e) {
                    mainWindow.webContents.send('add-log', `ExifTool error for ${path.basename(mediaPath)}: ${e.message}`, 'error');
                    skippedCount++;
                }
            } else {
                skippedCount++;
            }
        }

        mainWindow.webContents.send('processing-complete', { fixed: fixedCount, skipped: skippedCount });

    } catch (err) {
        mainWindow.webContents.send('add-log', `Fatal Error: ${err.message}`, 'error');
    } finally {
        // Always close exiftool instance
        exiftool.end();
    }
}

function normalizePath(p) {
    return p.toLowerCase()
        .replace(/\.json$/, '')
        .replace(/\(\d+\)/g, '')
        .replace(/ - edited/g, '')
        .replace(/_edited/g, '')
        .replace(/-collage/g, '')
        .replace(/\.supplemental-metadata/, '')
        .trim();
}

function parseTimestampFromFilename(f) {
    // Matches YYYYMMDD_HHMMSS (standard Android/IMG)
    let m = f.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})[_-]?(\d{2})[_-]?(\d{2})[_-]?(\d{2})/);
    if (m) {
        const d = new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]));
        if (!isNaN(d.getTime())) return d.getTime();
    }
    // Matches YYYYMMDD (date only)
    m = f.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})/);
    if (m) {
        const d = new Date(Date.UTC(m[1], m[2] - 1, m[3], 12, 0, 0));
        if (!isNaN(d.getTime())) return d.getTime();
    }
    return null;
}