const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pageTrace", {
  capture: (input) => ipcRenderer.invoke("capture", input),
  resumeCapture: () => ipcRenderer.invoke("resume-capture"),
  analyzeCapture: (index, threshold) =>
    ipcRenderer.invoke("analyze-capture", index, threshold),
  openCapture: () => ipcRenderer.invoke("open-capture"),
  scan: (threshold) => ipcRenderer.invoke("scan", threshold),
  sample: (threshold) => ipcRenderer.invoke("sample", threshold),
  cancel: () => ipcRenderer.invoke("cancel"),
  export: () => ipcRenderer.invoke("export"),
  openExport: () => ipcRenderer.invoke("open-export"),
  onProgress: (callback) => {
    ipcRenderer.on("progress", (_event, data) => callback(data));
  },
});
