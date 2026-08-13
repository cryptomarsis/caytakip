const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('caylikDesktop', {
  saveBase64File: (payload) => ipcRenderer.invoke('caylik:save-base64-file', payload),
  printPdf: (payload) => ipcRenderer.invoke('caylik:print-pdf', payload),
});
