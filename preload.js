const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Actions
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    startProcessing: (options) => ipcRenderer.send('start-processing', options),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    getPlatform: () => ipcRenderer.invoke('get-platform'),

    // Listeners
    onUpdateProgress: (callback) => {
        ipcRenderer.removeAllListeners('update-progress');
        ipcRenderer.on('update-progress', (event, current, total) => callback(current, total));
    },
    onLog: (callback) => {
        // Don't remove listeners here so we can receive multiple log messages
        ipcRenderer.on('add-log', (event, msg, type) => callback(msg, type));
    },
    onComplete: (callback) => {
        ipcRenderer.removeAllListeners('processing-complete');
        ipcRenderer.on('processing-complete', (event, stats) => callback(stats));
    }
});