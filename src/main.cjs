const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { scan, exportBundle, publicManifest } = require("./scanner.cjs");
const { createSample } = require("./sample.cjs");
let window,
  current,
  busy = false,
  controller,
  lastExport;
const samples = [];
function authorized(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw Error("Unauthorized sender");
}
function validateThreshold(value) {
  if (!Number.isFinite(value) || value < 1 || value > 1000)
    throw Error("Threshold must be 1–1000 MiB.");
}
function progress(p) {
  if (window && !window.isDestroyed()) window.webContents.send("progress", p);
}
app.setName("SiteAtlas");
app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1440,
    height: 1050,
    minWidth: 1060,
    minHeight: 760,
    title: "SiteAtlas",
    backgroundColor: "#f7f8fa",
    icon: path.join(__dirname, "assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  window.loadFile(path.join(__dirname, "index.html"));
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  for (const root of samples)
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {}
});
async function performScan(threshold, source) {
  controller = new AbortController();
  try {
    const result = await scan(
      source,
      { threshold: threshold * 1048576, signal: controller.signal },
      progress,
    );
    current = result;
    lastExport = null;
    return publicManifest(current);
  } finally {
    controller = null;
  }
}
ipcMain.handle("scan", async (event, threshold) => {
  authorized(event);
  if (busy) throw Error("An operation is already running.");
  validateThreshold(threshold);
  busy = true;
  try {
    const pick = await dialog.showOpenDialog(window, {
      title: "Choose the root folder of your website",
      properties: ["openDirectory"],
    });
    if (pick.canceled) return null;
    return await performScan(threshold, pick.filePaths[0]);
  } finally {
    busy = false;
  }
});
ipcMain.handle("sample", async (event, threshold) => {
  authorized(event);
  if (busy) throw Error("An operation is already running.");
  validateThreshold(threshold);
  busy = true;
  try {
    const sample = await createSample();
    samples.push(sample.root);
    return await performScan(threshold, sample.site);
  } finally {
    busy = false;
  }
});
ipcMain.handle("cancel", (event) => {
  authorized(event);
  controller?.abort();
});
ipcMain.handle("export", async (event) => {
  authorized(event);
  if (busy) throw Error("An operation is already running.");
  if (!current) throw Error("Scan a folder first.");
  busy = true;
  try {
    const pick = await dialog.showOpenDialog(window, {
      title: "Choose an export destination outside the website folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (pick.canceled) return null;
    const result = await exportBundle(current, pick.filePaths[0], progress);
    lastExport = result.path;
    return result;
  } finally {
    busy = false;
  }
});
ipcMain.handle("open-export", async (event) => {
  authorized(event);
  if (!lastExport) throw Error("Export a blueprint first.");
  const error = await shell.openPath(lastExport);
  if (error) throw Error(error);
});
