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
const {
  captureSite,
  options: captureOptions,
  urlOf,
} = require("./capture.cjs");
const { renderPage } = require("./browser-capture.cjs");
const samples = [];
let capturedSites = [];
let captureProject;
let httrackExecutable;

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
app.setName("PageTrace");
app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1440,
    height: 1050,
    minWidth: 1060,
    minHeight: 760,
    title: "PageTrace",
    backgroundColor: "#ffffff",
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
  controller?.abort();
  for (const root of samples)
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {}
});
async function performScan(threshold, source, importInfo) {
  controller = new AbortController();
  try {
    const result = await scan(
      source,
      {
        threshold: threshold * 1048576,
        signal: controller.signal,
        httrack: !!importInfo,
      },
      progress,
    );
    if (importInfo) result.import = importInfo;
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
ipcMain.handle("import-httrack", async (event, threshold) => {
  authorized(event);
  if (busy) throw Error("An operation is already running.");
  validateThreshold(threshold);
  busy = true;
  try {
    const pick = await dialog.showOpenDialog(window, {
      title: "Choose an HTTrack project folder containing hts-cache",
      properties: ["openDirectory"],
    });
    if (pick.canceled) return null;
    const info = await require("./httrack-import.cjs").inspectProject(
      pick.filePaths[0],
    );
    return await performScan(threshold, pick.filePaths[0], info);
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
    controller = new AbortController();
    const sample = await createSample(progress, controller.signal);
    samples.push(sample.root);
    return await performScan(threshold, sample.site);
  } finally {
    controller = null;
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

async function selectHTTrack() {
  if (httrackExecutable) return true;
  const bundled = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, "..", "vendor"),
    "httrack",
    process.platform === "win32" ? "httrack.exe" : "httrack",
  );
  if (fs.existsSync(bundled)) {
    httrackExecutable = bundled;
    return true;
  }
  const pick = await dialog.showOpenDialog(window, {
    title:
      "Select installed HTTrack command-line executable (httrack.exe, not WinHTTrack.exe or Setup)",
    properties: ["openFile"],
    ...(process.platform === "win32"
      ? { filters: [{ name: "HTTrack CLI", extensions: ["exe"] }] }
      : {}),
  });
  if (pick.canceled) return false;
  if (!/^httrack(?:\.exe)?$/i.test(path.basename(pick.filePaths[0])))
    throw Error(
      "Select httrack.exe (the command-line engine), not the installer or WinHTTrack interface.",
    );
  httrackExecutable = pick.filePaths[0];
  return true;
}
async function runCapture(project) {
  if (project.options.mode === "httrack" && !(await selectHTTrack()))
    return null;
  controller = new AbortController();
  const signal = controller.signal;
  capturedSites = [];
  try {
    for (const site of project.sites) {
      if (signal.aborted) break;
      const directory = path.join(project.directory, site.folder);
      if (project.options.mode === "httrack") {
        const result = await require("./httrack-engine.cjs").captureHTTrack(
          httrackExecutable,
          site.url,
          directory,
          project.options,
          { signal, progress: (p) => progress({ ...p, site: site.url }) },
        );
        if (signal.aborted) break;
        // Keep the complete mirror, then derive a separate reconstruction kit.
        const analysis = await scan(
          directory,
          { httrack: true, signal },
          progress,
        );
        analysis.import = {
          tool: "HTTrack",
          format: "local-mirror",
          note: "Captured by the HTTrack CLI. Cache and configuration excluded from reconstruction kit.",
        };
        const kit = await exportBundle(analysis, project.directory, progress);
        capturedSites.push({
          url: site.url,
          directory,
          mirror: result.mirror,
          status: "review log",
          files: analysis.files.length,
          pages: analysis.pages.length,
          bytes: analysis.totalBytes,
          failed: null,
          kit: kit.path,
          httrack: true,
        });
        current = analysis;
        lastExport = kit.path;
        continue;
      }
      const resume = fs.existsSync(path.join(directory, "capture.json"));
      const result = await captureSite(
        site.url,
        directory,
        project.options,
        {
          signal,
          progress: (p) => progress({ ...p, site: site.url }),
          render: (url, signal, permitted) =>
            renderPage(url, signal, permitted, {
              timeoutMs: project.options.timeoutMs,
              maxRequests: project.options.maxFiles || Infinity,
              maxBytes: Math.min(
                project.options.maxBytes || Infinity,
                project.options.maxFileBytes || Infinity,
              ),
            }),
        },
        resume,
      );
      capturedSites.push({
        url: site.url,
        directory,
        mirror: result.mirror,
        status: result.state.status,
        files: result.state.records.filter((r) => r.status === "saved").length,
        pages: result.state.pages,
        bytes: result.state.bytes,
        failed: result.state.records.filter(
          (r) =>
            r.status === "failed" ||
            r.renderError ||
            r.discoveryError ||
            r.rewriteError,
        ).length,
      });
    }
    return {
      directory: project.directory,
      sites: capturedSites.map(({ mirror, ...site }, index) => ({
        ...site,
        index,
      })),
      manifest:
        project.options.mode === "httrack" && capturedSites.length
          ? publicManifest(current)
          : null,
      paused: signal.aborted,
    };
  } finally {
    controller = null;
  }
}
ipcMain.handle("capture", async (event, input) => {
  authorized(event);
  if (busy) throw Error("An operation is already running.");
  if (!input || !Array.isArray(input.urls) || input.urls.length < 1)
    throw Error("Enter at least one website URL.");
  const urls = [...new Set(input.urls.map((value) => urlOf(value)))];
  if (urls.includes(null))
    throw Error("Use complete HTTP(S) URLs without embedded credentials.");
  const opts = captureOptions(input.options);
  busy = true;
  try {
    const pick = await dialog.showOpenDialog(window, {
      title: "Choose where to save full website captures",
      properties: ["openDirectory", "createDirectory"],
    });
    if (pick.canceled) return null;
    const directory = await fs.promises.mkdtemp(
      path.join(pick.filePaths[0], "PageTrace-capture-"),
    );
    captureProject = {
      version: 1,
      directory,
      options: opts,
      sites: urls.map((url, index) => ({
        url,
        folder: `${index + 1}-${new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_").slice(0, 80)}`,
      })),
    };
    await fs.promises.writeFile(
      path.join(directory, "project.json"),
      JSON.stringify(captureProject, null, 2),
    );
    return await runCapture(captureProject);
  } finally {
    busy = false;
  }
});
ipcMain.handle("resume-capture", async (event) => {
  authorized(event);
  if (busy) throw Error("An operation is already running.");
  busy = true;
  try {
    const pick = await dialog.showOpenDialog(window, {
      title: "Choose a PageTrace capture project folder",
      properties: ["openDirectory"],
    });
    if (pick.canceled) return null;
    const directory = pick.filePaths[0];
    const project = JSON.parse(
      await fs.promises.readFile(path.join(directory, "project.json"), "utf8"),
    );
    if (
      project.version !== 1 ||
      !Array.isArray(project.sites) ||
      !project.sites.length
    )
      throw Error("Invalid capture project.");
    project.options = captureOptions(project.options);
    project.directory = directory;
    for (const site of project.sites) {
      if (
        !urlOf(site.url) ||
        typeof site.folder !== "string" ||
        !/^[a-z0-9.-]+$/i.test(site.folder) ||
        [".", ".."].includes(site.folder)
      )
        throw Error("Invalid capture site.");
    }
    captureProject = project;
    return await runCapture(project);
  } finally {
    busy = false;
  }
});
ipcMain.handle("analyze-capture", async (event, index, threshold) => {
  authorized(event);
  validateThreshold(threshold);
  if (busy) throw Error("An operation is already running.");
  if (!Number.isInteger(index) || !capturedSites[index])
    throw Error("Choose a captured site.");
  busy = true;
  try {
    return await performScan(
      threshold,
      capturedSites[index].mirror,
      capturedSites[index].httrack
        ? {
            tool: "HTTrack",
            note: "Local full capture; cache and logs excluded.",
          }
        : undefined,
    );
  } finally {
    busy = false;
  }
});
ipcMain.handle("open-capture", async (event) => {
  authorized(event);
  if (!captureProject) throw Error("Capture a website first.");
  const error = await shell.openPath(captureProject.directory);
  if (error) throw Error(error);
});
