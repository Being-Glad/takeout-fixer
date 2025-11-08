const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electron', {
    openDialog: () => ipcRenderer.invoke('open-dialog'),
    startProcess: (p) => ipcRenderer.send('start-process', p),
    onLog: (cb) => ipcRenderer.on('log', (e, m, t) => cb(m, t)),
    onProgress: (cb) => ipcRenderer.on('progress', (e, c, t) => cb(c, t)),
    onComplete: (cb) => ipcRenderer.on('complete', (e, s) => cb(s)),
    openExternal: (u) => ipcRenderer.send('open-external', u)
});