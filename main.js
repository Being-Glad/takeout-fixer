const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exiftool } = require('exiftool-vendored');
const pLimit = require('p-limit');
const archiver = require('archiver');
const os = require('os');

// --- Global State ---
let mainWindow;
const isMac = process.platform === 'darwin';
const EPOCH_ZERO_TIME = new Date(0).getTime(); // For checking against garbage "1970" dates

// --- Window Management ---
function createWindow() {
    console.log('--- STARTING WINDOW CREATION ---');
    
    // ICON STRATEGY: prioritizing 'assets' for dev, 'build' for prod fallback if needed
    let iconPath = path.join(__dirname, 'assets', 'icon.png');
    if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, 'build', 'icon.png');
    }
    console.log('Looking for icon at:', iconPath);
    let appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

    mainWindow = new BrowserWindow({
        width: 1024, height: 800, minWidth: 900, minHeight: 700,
        titleBarStyle: isMac ? 'hiddenInset' : 'default',
        backgroundColor: '#09090b',
        // Match titlebar overlay to our dark theme
        ...(isMac && { titleBarOverlay: { color: '#09090b', symbolColor: '#e5e7eb', height: 40 } }),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: appIcon,
        show: false // Don't show until ready to avoid white flash
    });

    if (isMac && appIcon) {
        app.dock.setIcon(appIcon);
    }

    const appHtmlPath = path.join(__dirname, 'app.html');
    if (!fs.existsSync(appHtmlPath)) {
        console.error('FATAL: app.html not found at', appHtmlPath);
        return;
    }

    mainWindow.loadFile(appHtmlPath);
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (!isMac) {
        app.quit();
        exiftool.end();
    }
});

app.on('before-quit', () => {
    exiftool.end();
});

// --- IPC HANDLERS ---
ipcMain.handle('get-platform', () => process.platform);

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

ipcMain.on('open-external', (event, url) => {
    if (url && (url.startsWith('file://') || path.isAbsolute(url))) {
        // Open local folders in Finder/Explorer
        shell.showItemInFolder(url.replace('file://', ''));
    } else if (url) {
        // Open URLs in default browser
        shell.openExternal(url);
    }
});

ipcMain.on('start-processing', async (event, options) => {
    // Wrap in try-catch to prevent main process crashes from bubbling up as red screens
    try {
        await processDirectory(options.paths[0], options.mode, event);
    } catch (e) {
        console.error('Processing Error:', e);
        event.sender.send('add-log', `FATAL ERROR: ${e.message}`, 'error');
        event.sender.send('processing-complete', { total: 0, fixed: 0, failed: 0 });
    }
});

// --- Core Processing Logic ---

/**
 * Normalizes a file path to strip Google Takeout suffixes for matching.
 */
const normalizePath = (p) => {
    if (!p) return '';
    const dir = path.dirname(p);
    let name = path.basename(p).toLowerCase();
    
    // Strip .json if it exists
    if (name.endsWith('.json')) {
        name = name.substring(0, name.length - 5);
    }

    // Strip common Google Takeout suffixes
    name = name.replace(/(\(\d+\))|(_\d{13,})|(-collage)|(-cinematic)|(-remastered)|(-pop_out)|(-edited)/g, '').trim();
    
    return path.join(dir, name);
}

/**
 * Smarter JSON finder that uses the new normalizePath logic.
 */
async function findJsonSidecar(filePath, allJsonFiles) {
    const normalizedMediaKey = normalizePath(filePath);

    // Find a JSON file in the map that normalizes to the same key
    const matchingJsonPath = allJsonFiles.get(normalizedMediaKey);
    if (matchingJsonPath) {
        return matchingJsonPath;
    }
    
    // Fallback: check for simple "file.jpg.json" if map fails
    const simpleJsonPath = filePath + '.json';
    if (await fs.pathExists(simpleJsonPath)) {
        return simpleJsonPath;
    }

    return null;
}

/**
 * Validates a date is reasonable.
 * Allows 1970, but rejects the *specific* 1970-01-01 (timestamp 0)
 */
const MIN_VALID_YEAR = 1970; // Allow 1970s dates
const MAX_VALID_YEAR = new Date().getFullYear() + 1; // +1 for buffer
function isValidDate(d) {
    if (!d || isNaN(d.getTime())) return false;
    // ** NEW: Specifically reject timestamp 0 **
    if (d.getTime() === EPOCH_ZERO_TIME) return false;
    
    const year = d.getFullYear();
    return year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR;
}

function parseDateFromFilename(filename) {
    const name = path.basename(filename);
    const m = name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})?(\d{2})?(\d{2})?/) || 
              name.match(/IMG[-_](\d{4})(\d{2})(\d{2})[-_](\d{6})?/);
    
    if (m) {
        const year = parseInt(m[1] || m[0].substring(4,8));
        const month = parseInt(m[2] || m[0].substring(8,10)) - 1; // Month is 0-indexed
        const day = parseInt(m[3] || m[0].substring(10,12));
        const hour = m[4] ? parseInt(m[4]) : 12;
        const minute = m[5] ? parseInt(m[5]) : 0;
        const second = m[6] ? parseInt(m[6]) : 0;
        
        const date = new Date(Date.UTC(year, month, day, hour, minute, second));
        
        if (isValidDate(date)) {
            return date;
        }
    }
    return null;
}

/**
 * Fixes a single file.
 */
async function fixFile(filePath, relativePath, mode, outputPath, allJsonFiles) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        const supportedExts = [
            '.jpg', '.jpeg', '.png', '.mov', '.mp4', '.m4v', '.heic', 
            '.gif', '.webp', '.tiff', '.bmp', '.avi', '.mkv', '.3gp', '.mpg', '.mpeg'
        ];
        
        if (!supportedExts.includes(ext)) {
            return { status: 'skipped' };
        }

        let dateToUse = null, gpsToUse = null, description = null;
        const jsonPath = await findJsonSidecar(filePath, allJsonFiles);
        
        if (jsonPath) {
            try {
                const data = await fs.readJson(jsonPath);
                const timestamp = data.photoTakenTime?.timestamp || data.creationTime?.timestamp;
                if (timestamp) {
                    const d = new Date(parseInt(timestamp) * 1000);
                    if (isValidDate(d)) {
                        dateToUse = d;
                    }
                }
                if (data.geoData && (data.geoData.latitude || data.geoData.longitude)) {
                    gpsToUse = data.geoData;
                }
                if (data.description) {
                    description = data.description;
                }
            } catch (e) { /* JSON parse error, fall back */ }
        }
        
        if (!dateToUse) {
            dateToUse = parseDateFromFilename(filePath);
        }

        let targetPath = filePath;
        let isSkipped = !dateToUse && !description;

        if (mode !== 'inplace' && outputPath && relativePath) {
            let destDir = path.join(outputPath, path.dirname(relativePath));
            
            // ** _SKIPPED FOLDER LOGIC **
            if (isSkipped) {
                destDir = path.join(destDir, '_SKIPPED');
            }

            await fs.ensureDir(destDir);
            targetPath = path.join(destDir, path.basename(relativePath));

            if (await fs.pathExists(targetPath)) {
                const name = path.parse(filePath).name;
                targetPath = path.join(destDir, `${name}_${Date.now().toString().slice(-6)}${ext}`);
            }
            
            // ** CRITICAL: Preserve timestamps on copy **
            await fs.copy(filePath, targetPath, { preserveTimestamps: true }); 
        }

        if (!isSkipped) {
            // --- START FIX (Run on targetPath) ---
            const tags = {};
            
            if (dateToUse) {
                Object.assign(tags, {
                    AllDates: dateToUse.toISOString(),
                    DateTimeOriginal: dateToUse.toISOString(),
                    CreateDate: dateToUse.toISOString(),
                    MediaCreateDate: dateToUse.toISOString(),
                    MediaModifyDate: dateToUse.toISOString()
                });
            }
            
            if (gpsToUse) {
                Object.assign(tags, {
                    GPSLatitude: gpsToUse.latitude,
                    GPSLongitude: gpsToUse.longitude,
                    GPSAltitude: gpsToUse.altitude || 0
                });
            }

            if (description) {
                Object.assign(tags, {
                    Description: description,
                    'Caption-Abstract': description,
                    UserComment: description
                });
            }
            
            await exiftool.write(targetPath, tags, ['-overwrite_original']);

            if (dateToUse) {
                // Apply filesystem timestamps LAST
                await fs.utimes(targetPath, dateToUse, dateToUse);
            } else {
                // ** CRITICAL FIX **
                // No valid date, but we wrote a description which stamped "today's date".
                // Restore the original file's timestamp.
                const originalStats = await fs.stat(filePath);
                await fs.utimes(targetPath, originalStats.atime, originalStats.mtime);
            }
            // --- END FIX ---

            return { status: 'fixed', finalPath: targetPath };
        }
        
        return { status: 'failed_no_date', finalPath: targetPath };

    } catch (error) {
        return { status: 'error', error: error.message || 'Unknown error' };
    }
}

async function processDirectory(dirPath, mode, event) {
    if (!dirPath) {
        event.sender.send('add-log', 'No folder selected. Aborting.', 'error');
        return;
    }

    event.sender.send('add-log', `Starting scan of: ${dirPath}`);
    
    let outputPath = (mode === 'inplace') ? dirPath : null;
    let archive = null;
    let tempDir = null;

    if (mode === 'merge' || mode === 'zip') {
        if (mode === 'zip') {
             const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Zip Archive',
                defaultPath: path.join(path.dirname(dirPath), 'Takeout-Fixed.zip'),
                filters: [{ name: 'Zip Files', extensions: ['zip'] }]
             });
             if (canceled || !filePath) {
                 event.sender.send('add-log', 'Zip save cancelled.', 'warn');
                 event.sender.send('processing-complete', { total: 0, fixed: 0, failed: 0 });
                 return;
             }
             outputPath = filePath;
             tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'takeout-fixer-'));
             archive = archiver('zip', { zlib: { level: 9 } });
             const outputStream = fs.createWriteStream(outputPath);
             archive.pipe(outputStream);
        } else { // mode === 'merge'
             const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Output Folder for Merged Photos',
                properties: ['openDirectory', 'createDirectory']
            });
            if (canceled || !filePaths[0]) {
                event.sender.send('add-log', 'Merge folder selection cancelled.', 'warn');
                event.sender.send('processing-complete', { total: 0, fixed: 0, failed: 0 });
                return;
            }
            outputPath = filePaths[0];
        }
    }
    
    event.sender.send('add-log', `Scanning library...`);
    const filesToProcess = [];
    const allJsonFiles = new Map();

    async function scan(dir) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await scan(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(fullPath).toLowerCase();
                    if (ext === '.json') {
                        allJsonFiles.set(normalizePath(fullPath), fullPath);
                    } 
                    else if (!['.ds_store', '.ini', '.db'].includes(ext)) {
                         filesToProcess.push(fullPath);
                    }
                }
            }
        } catch (e) {
            event.sender.send('add-log', `Scan warning: inaccessible folder ${dir}`, 'warn');
        }
    }

    await scan(dirPath);
    const total = filesToProcess.length;
    event.sender.send('add-log', `Found ${total} potential media files and ${allJsonFiles.size} JSON metadata files. Starting processing...`);

    if (total === 0) {
         event.sender.send('add-log', 'No media files found in selected folder.', 'warn');
         event.sender.send('processing-complete', { total: 0, fixed: 0, failed: 0 });
         return;
    }

    let processed = 0, fixed = 0, failed = 0;
    const limit = pLimit(25); 

    const tasks = filesToProcess.map(filePath => limit(async () => {
        const effectiveOutputPath = (mode === 'zip') ? tempDir : (mode === 'merge' ? outputPath : null);
        const relativePath = path.relative(dirPath, filePath);

        const res = await fixFile(filePath, relativePath, mode, effectiveOutputPath, allJsonFiles);
        
        processed++;
        if (processed % Math.ceil(total / 200) === 0 || processed === total) {
             event.sender.send('update-progress', processed, total);
        }

        if (res.status === 'fixed') {
            fixed++;
        } else if (res.status !== 'skipped') {
             if (res.status === 'failed_no_date' || res.status === 'error') {
                 failed++;
                 if (res.status === 'error') {
                    event.sender.send('add-log', `Failed: ${path.basename(filePath)} (${res.error || res.status})`, 'error');
                 }
             }
        }

        if (mode === 'zip' && archive && tempDir && res.finalPath) {
            const nameInZip = path.relative(tempDir, res.finalPath);
            archive.file(res.finalPath, { name: nameInZip });
        }
    }));

    await Promise.all(tasks);

    if (mode === 'zip' && archive && tempDir) {
        event.sender.send('add-log', 'All files processed. Finalizing zip archive (this may take a minute)...');
        await archive.finalize();
        try {
            await fs.remove(tempDir);
        } catch(e) {
            console.error('Failed to clean up temp dir:', e);
        }
        event.sender.send('add-log', 'Zip archive created successfully!', 'success');
    }
    
    const finalOutputPath = (mode === 'merge' ? outputPath : (mode === 'zip' ? outputPath : dirPath));
    
    event.sender.send('add-log', `--- COMPLETE --- Fixed: ${fixed}, Skipped: ${failed}.`, 'success');
    event.sender.send('processing-complete', { 
        total, 
        fixed, 
        failed, 
        outputPath: finalOutputPath 
    });
}