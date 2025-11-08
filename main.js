const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
// Use a singleton instance of exiftool for better performance
const exiftool = require('exiftool-vendored').exiftool;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#09090b',
        titleBarStyle: 'hidden',   // Hides native title bar
        titleBarOverlay: {
             color: '#09090b',     // Matches Mac traffic light area background
             symbolColor: '#ffffff',
             height: 45
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false // Required for some exiftool operations
        },
        icon: path.join(__dirname, 'build/icon.png')
    });

    // Mac-specific: Force dock icon
    if (process.platform === 'darwin') {
        app.dock.setIcon(path.join(__dirname, 'build/icon.png'));
    }

    // Windows/Linux: Hide old-style menu bar
    if (process.platform !== 'darwin') {
        mainWindow.setMenuBarVisibility(false);
    }

    mainWindow.loadFile('app.html');
}

app.whenReady().then(createWindow);

// Proper cleanup on exit
app.on('window-all-closed', () => {
    exiftool.end(); // Critical: kills the perl process
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections']
    });
    return result.filePaths;
});

ipcMain.on('start-processing', async (event, paths) => {
    const sender = event.sender;
    // Helper to send logs to UI
    const sendLog = (msg, type = 'info') => sender.send('log-message', msg, type);

    sendLog('Starting deeper analysis...');
    let mediaFiles = [];
    let jsonMap = new Map();

    // 1. Recursive Scan Function
    async function scanDir(dir) {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (ext === '.json') {
                        // Read JSON metadata
                        try {
                            const data = JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
                            // Look for standard Google Takeout timestamp fields
                            const timestamp = data.photoTakenTime?.timestamp || data.creationTime?.timestamp;
                            if (timestamp) {
                                // Store metadata mapped to the file path (normalized)
                                jsonMap.set(normalizePath(fullPath), {
                                    timestamp: parseInt(timestamp),
                                    title: data.title,
                                    description: data.description,
                                    gps: data.geoData
                                });
                            }
                        } catch (e) {
                            // Ignore unreadable/bad JSONs silently
                        }
                    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.mov', '.mp4', '.avi', '.mkv'].includes(ext)) {
                        mediaFiles.push(fullPath);
                    }
                }
            }
        } catch (err) {
            sendLog(`Could not scan directory: ${dir}`, 'error');
        }
    }

    // Helper to normalize paths for matching (removes .json, handles duplicates like (1))
    function normalizePath(filePath) {
        const dir = path.dirname(filePath);
        const name = path.basename(filePath);
        return path.join(dir, name.toLowerCase().replace(/\.json$/, '').replace(/\(\d+\)/, '').trim());
    }

    // 2. Start Scanning
    for (const p of paths) {
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
            await scanDir(p);
        }
    }

    sendLog(`Found ${mediaFiles.length} media files. Starting fix process...`);
    sender.send('progress-update', { total: mediaFiles.length, current: 0 });

    let fixed = 0, skipped = 0;

    // 3. Process Files
    for (let i = 0; i < mediaFiles.length; i++) {
        const filePath = mediaFiles[i];
        const normalized = normalizePath(filePath);
        // Try exact match first, then try matching without extension (common for some Takeout files)
        let metadata = jsonMap.get(normalized) || jsonMap.get(normalized.substring(0, normalized.lastIndexOf('.')));

        if (metadata) {
             // Inform user *before* starting a potentially long write operation
            if (i % 5 === 0 || fs.statSync(filePath).size > 100 * 1024 * 1024) { // Log every 5th file OR any file > 100MB
                 sendLog(`Processing: ${path.basename(filePath)}...`);
            }

            try {
                // Format date for ExifTool (YYYY:MM:DD HH:mm:ss)
                const dateStr = new Date(metadata.timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, '').replace(/[-:]/g, ':').replace('T', ' ');

                // Prepare tags to write
                let tags = {
                    AllDates: dateStr,
                    FileModifyDate: dateStr,
                    FileCreateDate: dateStr
                };

                // Add GPS if available
                if (metadata.gps && (metadata.gps.latitude || metadata.gps.longitude)) {
                    tags.GPSLatitude = metadata.gps.latitude;
                    tags.GPSLongitude = metadata.gps.longitude;
                    tags.GPSAltitude = metadata.gps.altitude;
                }
                // Add Description/Caption if available
                if (metadata.description) {
                    tags.ImageDescription = metadata.description;
                    tags['Caption-Abstract'] = metadata.description;
                }
                // Add Title if available
                if (metadata.title) {
                    tags.Title = metadata.title;
                }

                // Write data using ExifTool (overwrite_original prevents _original backup files)
                await exiftool.write(filePath, tags, ['-overwrite_original']);

                // Also update file system timestamps explicitly as a backup
                const utime = metadata.timestamp;
                await fs.promises.utimes(filePath, utime, utime);

                fixed++;
            } catch (e) {
                sendLog(`Failed to fix ${path.basename(filePath)}: ${e.message}`, 'error');
                skipped++;
            }
        } else {
            skipped++;
             // Only log missing metadata occasionally to avoid spamming log
             if (skipped < 10 || skipped % 50 === 0) {
                 sendLog(`No JSON found for: ${path.basename(filePath)}`, 'warn');
             }
        }
        // Update progress bar
        sender.send('progress-update', { total: mediaFiles.length, current: i + 1 });
    }

    sendLog('Finalizing...', 'success');
    sender.send('process-complete', { fixed, skipped });
});