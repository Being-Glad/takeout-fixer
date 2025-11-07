const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
// Use the new, better package
const { exiftool } = require('exiftool-vendored');

// No need for a global instance, this package manages itself.

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  
  // Load the desktop app's UI
  mainWindow.loadFile('app.html');
  
  // mainWindow.webContents.openDevTools(); // Uncomment for debugging
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // IMPORTANT: Close the bundled exiftool process when the app quits
  exiftool.end();
  if (process.platform !== 'darwin') app.quit();
});

// --- File Selection ---
ipcMain.handle('dialog:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  });
  if (canceled) return [];
  return filePaths;
});

// --- Core Processing Logic ---
ipcMain.handle('process-files', async (event, filePaths) => {
  const results = {
    processed: [],
    skipped: [],
    error: null,
  };

  try {
    // 1. Recursively find all media/json files from dropped paths
    const { mediaFiles, jsonFiles } = await findAllFiles(filePaths);

    // 2. Build Metadata Map
    const metadataMap = new Map();
    for (const jsonPath of jsonFiles) {
      try {
        const content = await fs.promises.readFile(jsonPath, 'utf8');
        const data = JSON.parse(content);
        const key = normalizeJsonKey(path.basename(jsonPath));
        if (key && (data.photoTakenTime || data.creationTime)) {
          metadataMap.set(key, data);
        }
      } catch (e) {
        // Ignore bad JSONs
      }
    }

    // 3. Process each media file
    for (const mediaPath of mediaFiles) {
      const mediaKey = normalizeMediaKey(path.basename(mediaPath));
      const metadata = metadataMap.get(mediaKey);
      let dateSource = null;
      let timestamp = null;

      // A. Get date from JSON
      if (metadata) {
        timestamp = metadata.photoTakenTime?.timestamp || metadata.creationTime?.timestamp;
        dateSource = 'JSON';
      }
      
      // B. Get date from filename (if no JSON)
      if (!timestamp) {
        const parsedTs = parseTimestampFromFilename(path.basename(mediaPath));
        if (parsedTs) {
          timestamp = (parsedTs / 1000).toString(); // We need seconds
          dateSource = 'Filename';
        }
      }

      // C. Process if we have a date, skip if not
      if (timestamp) {
        const date = new Date(parseInt(timestamp) * 1000);
        // Format for EXIF: "YYYY:MM:DD HH:MM:SS"
        const exifDate = date.toISOString().replace('T', ' ').substring(0, 19).replace(/-/g, ':');
        
        // This package uses slightly different tag names
        const args = {
          // File dates
          AllDates: exifDate,
          DateTimeOriginal: exifDate,
          CreateDate: exifDate,
          ModifyDate: exifDate,
          // Metadata
          Title: metadata?.title,
          Description: metadata?.description, // Use 'Description' not 'ImageDescription'
          // GPS
          GPSLatitude: metadata?.geoData?.latitude,
          GPSLongitude: metadata?.geoData?.longitude,
          GPSLatitudeRef: metadata?.geoData?.latitude && (metadata.geoData.latitude >= 0 ? 'N' : 'S'),
          GPSLongitudeRef: metadata?.geoData?.longitude && (metadata.geoData.longitude >= 0 ? 'E' : 'W'),
        };

        // Remove undefined keys
        Object.keys(args).forEach(key => (args[key] === undefined || args[key] === null) && delete args[key]);

        try {
          // Write tags using ExifTool
          // The new package syntax is simpler
          await exiftool.write(mediaPath, args, ['-overwrite_original']);
          
          // Set file system dates (utimes)
          await fs.promises.utimes(mediaPath, date, date);

          results.processed.push(`${path.basename(mediaPath)} (Fixed using ${dateSource})`);
        } catch (e) {
          results.skipped.push(`${path.basename(mediaPath)} (Error: ${e.message})`);
        }
      } else {
        results.skipped.push(`${path.basename(mediaPath)} (No date found in JSON or filename)`);
      }
    }
    
    return results;

  } catch (e) {
    results.error = `A fatal error occurred: ${e.message}.`;
    return results;
  }
});

// --- Helper Functions ---

async function findAllFiles(paths) {
  const mediaFiles = [];
  const jsonFiles = [];
  const mediaExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tiff', '.mov', '.mp4', '.avi', '.mkv', '.3gp']);

  const queue = [...paths];
  while (queue.length > 0) {
    const currentPath = queue.pop();
    try {
      const stats = await fs.promises.stat(currentPath);
      if (stats.isDirectory()) {
        const files = await fs.promises.readdir(currentPath);
        for (const file of files) {
          queue.push(path.join(currentPath, file));
        }
      } else if (stats.isFile()) {
        const ext = path.extname(currentPath).toLowerCase();
        if (ext === '.json') {
          jsonFiles.push(currentPath);
        } else if (mediaExts.has(ext)) {
          mediaFiles.push(currentPath);
        }
      }
    } catch (e) {
      console.error(`Error processing path ${currentPath}: ${e.message}`);
    }
  }
  return { mediaFiles, jsonFiles };
}

// (Normalization functions are identical to our previous index.html)
const normalizeJsonKey = (jsonName) => {
  let key = jsonName.toLowerCase();
  key = key.replace(/\.json$/i, '');
  key = key.replace(/\(\d+\)$/, '');
  const metadataSuffix = '.supplemental-metadata';
  if (key.endsWith(metadataSuffix)) {
    key = key.substring(0, key.length - metadataSuffix.length);
  }
  return key;
};

const normalizeMediaKey = (mediaName) => {
  let key = mediaName.toLowerCase();
  const lastDotIndex = key.lastIndexOf('.');
  if (lastDotIndex === -1) return key;
  const extension = key.substring(lastDotIndex);
  let baseName = key.substring(0, lastDotIndex);
  const patternsToStrip = [
    /\(\d+\)$/i, /_\d{13}$/i, /-collage$/i, /-cinematic$/i, /-remastered$/i, /-pop_out$/i,
  ];
  for (const pattern of patternsToStrip) {
    while (baseName.match(pattern)) {
      baseName = baseName.replace(pattern, '');
    }
  }
  return (baseName + extension).trim();
};

const parseTimestampFromFilename = (filename) => {
  let match = filename.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})[_-]?(\d{2})[_-]?(\d{2})[_-]?(\d{2})/);
  if (match) {
    const [, y, mo, d, h, m, s] = match.map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, h, m, s));
    if (!isNaN(date.getTime()) && date.getFullYear() === y) return date.getTime();
  }
  match = filename.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})/);
  if (match) {
    const [, y, mo, d] = match.map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
    if (!isNaN(date.getTime()) && date.getFullYear() === y) return date.getTime();
  }
  match = filename.match(/(\d{2})[_-](\d{2})[_-](\d{4})/);
  if (match) {
    const [, d, mo, y] = match.map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
    if (!isNaN(date.getTime()) && date.getFullYear() === y) return date.getTime();
  }
  return null;
};