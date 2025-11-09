const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    startProcessing: (inputPath) => ipcRenderer.send('start-processing', inputPath),
    onProgress: (callback) => ipcRenderer.on('update-progress', (event, current, total) => callback(current, total)),
    onLog: (callback) => ipcRenderer.on('add-log', (event, msg, type) => callback(msg, type)),
    onComplete: (callback) => ipcRenderer.on('processing-complete', (event, stats) => callback(stats)),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    getPlatform: () => ipcRenderer.invoke('get-platform')
});