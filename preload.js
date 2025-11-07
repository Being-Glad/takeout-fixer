const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  processFiles: (paths) => ipcRenderer.invoke('process-files', paths),
});