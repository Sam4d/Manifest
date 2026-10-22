const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("siteAtlas", {
  scan: (threshold) => ipcRenderer.invoke("scan", threshold),
  sample: (threshold) => ipcRenderer.invoke("sample", threshold),
  cancel: () => ipcRenderer.invoke("cancel"),
  export: () => ipcRenderer.invoke("export"),
  openExport: () => ipcRenderer.invoke("open-export"),
  onProgress: (callback) => {
    ipcRenderer.on("progress", (_event, data) => callback(data));
  },
});
