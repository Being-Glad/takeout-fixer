const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Expose the platform (darwin = mac, win32 = windows, linux = linux)
    platform: process.platform,
    openDialog: () => ipcRenderer.invoke('open-dialog'),
    startProcessing: (paths) => ipcRenderer.send('start-processing', paths),
    onLog: (callback) => ipcRenderer.on('log-message', (event, msg, type) => callback(msg, type)),
    onComplete: (callback) => ipcRenderer.on('process-complete', (event, stats) => callback(stats)),
    onProgress: (callback) => ipcRenderer.on('progress-update', (event, data) => callback(data))
});