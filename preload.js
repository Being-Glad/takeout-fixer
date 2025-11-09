const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // UI to Main (Actions)
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    startProcessing: (inputPaths) => ipcRenderer.send('start-processing', inputPaths),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    getPlatform: () => ipcRenderer.invoke('get-platform'), // Used for macOS UI fix

    // Main to UI (Listeners)
    onProgress: (callback) => ipcRenderer.on('update-progress', (event, current, total) => callback(current, total)),
    onLog: (callback) => ipcRenderer.on('add-log', (event, msg, type) => callback(msg, type)),
    onComplete: (callback) => ipcRenderer.on('processing-complete', (event, stats) => callback(stats))
}); 