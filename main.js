const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exiftool } = require('exiftool-vendored');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900, height: 700, minWidth: 800, minHeight: 600, backgroundColor: '#030712', titleBarStyle: 'hiddenInset',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    if (process.platform !== 'darwin') mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('app.html');
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('open-dialog', async () => { const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'openDirectory', 'multiSelections'] }); return canceled ? null : filePaths; });
ipcMain.on('open-external', (event, url) => shell.openExternal(url));
ipcMain.on('start-process', async (event, paths) => {
    const sendLog = (m, t='info') => mainWindow.webContents.send('log', m, t);
    let mediaFiles = [], jsonFiles = new Map();
    function scanDir(dir) {
        try {
            fs.readdirSync(dir).forEach(f => {
                const full = path.join(dir, f), stat = fs.statSync(full);
                if (stat.isDirectory()) scanDir(full);
                else {
                    const ext = path.extname(f).toLowerCase();
                    if (ext === '.json') jsonFiles.set(normalize(f), { path: full, name: f });
                    else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.mov', '.mp4'].includes(ext)) mediaFiles.push({ path: full, name: f });
                }
            });
        } catch (e) { sendLog(`Scan error: ${e.message}`, 'error'); }
    }
    paths.forEach(p => fs.statSync(p).isDirectory() ? scanDir(p) : null);
    sendLog(`Found ${mediaFiles.length} media, ${jsonFiles.size} JSON files.`);
    let processed = 0, errors = 0;
    for (const media of mediaFiles) {
        try {
            const key = normalize(media.name);
            let metadata = jsonFiles.get(key);
            if (!metadata) { const base = key.substring(0, key.lastIndexOf('.')); for (const [k, v] of jsonFiles) if (k.startsWith(base)) { metadata = v; break; } }
            let date = null, tags = {};
            if (metadata) {
                const data = JSON.parse(fs.readFileSync(metadata.path, 'utf8')), ts = data.photoTakenTime?.timestamp || data.creationTime?.timestamp;
                if (ts) date = new Date(parseInt(ts) * 1000).toISOString();
                if (data.geoData?.latitude) { tags.GPSLatitude = data.geoData.latitude; tags.GPSLongitude = data.geoData.longitude; }
                if (data.description) tags.ImageDescription = data.description;
            } else {
                const m = media.name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
                if (m) date = new Date(Date.UTC(m[1], m[2]-1, m[3], m[4], m[5], m[6])).toISOString();
            }
            if (date) {
                tags.AllDates = date;
                await exiftool.write(media.path, tags, ['-overwrite_original']);
                const time = new Date(date); fs.utimesSync(media.path, time, time);
            } else { errors++; sendLog(`No date for ${media.name}`, 'warn'); }
        } catch (e) { errors++; sendLog(`Failed ${media.name}: ${e.message}`, 'error'); }
        mainWindow.webContents.send('progress', ++processed, mediaFiles.length);
    }
    mainWindow.webContents.send('complete', { total: mediaFiles.length, errors });
    exiftool.end();
});
function normalize(n) { return n.toLowerCase().replace(/\(\d+\)/g, '').replace(/_\d{13}|-collage|-cinematic/g, ''); }