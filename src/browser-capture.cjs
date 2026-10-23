const { BrowserWindow, session } = require("electron");
const crypto = require("node:crypto");
// Each page runs in a disposable sandbox with no preload, credentials, permissions or Node.
async function renderPage(url, signal, permitted, limits = {}) {
  signal?.throwIfAborted();
  const isolated = session.fromPartition("capture-" + crypto.randomUUID());
  isolated.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  isolated.setPermissionCheckHandler(() => false);
  const resources = new Set();
  let requests = 0,
    received = 0;
  const maxBytes = limits.maxBytes ?? 50 * 1048576;
  const maxRequests = limits.maxRequests ?? 2000;
  isolated.on("will-download", (event) => event.preventDefault());
  isolated.webRequest.onBeforeRequest((details, callback) => {
    if (
      !/^https?:/.test(details.url) ||
      !["GET", "HEAD", "OPTIONS"].includes(details.method) ||
      (details.resourceType === "mainFrame" &&
        new URL(details.url).origin !== new URL(url).origin) ||
      ++requests > maxRequests
    )
      return callback({ cancel: true });
    permitted(details.url).then(
      (ok) => callback({ cancel: !ok }),
      () => callback({ cancel: true }),
    );
  });
  const view = new BrowserWindow({
    show: false,
    width: 1440,
    height: 1000,
    webPreferences: {
      session: isolated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  view.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== new URL(url).origin) event.preventDefault();
  });
  const devtools = view.webContents.debugger;
  devtools.on("message", (_event, method, params) => {
    if (
      method === "Network.responseReceived" &&
      /^https?:/.test(params.response.url)
    )
      resources.add(params.response.url);
    if (method === "Network.dataReceived") {
      received += params.dataLength;
      if (received > maxBytes) view.webContents.stop();
    }
  });
  let timer, rejectStop;
  const stopped = new Promise((_, reject) => {
    rejectStop = reject;
    timer = setTimeout(
      () => reject(Error("Browser rendering timed out.")),
      limits.timeoutMs || 30000,
    );
  });
  const cancel = () => rejectStop(signal.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await Promise.race([view.loadURL("about:blank"), stopped]);
    devtools.attach("1.3");
    await Promise.race([devtools.sendCommand("Network.enable"), stopped]);
    await Promise.race([
      (async () => {
        await view.loadURL(url, {
          userAgent: "PageTrace/0.4 (+public website capture)",
        });
        // Bounded settling and scroll reveal common lazy-loaded assets; not infinite interaction.
        for (let i = 0; i < 4; i++) {
          signal?.throwIfAborted();
          await view.webContents.executeJavaScript(
            `window.scrollTo(0,${i}*window.innerHeight)`,
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      })(),
      stopped,
    ]);
    if (received > maxBytes) throw Error("Browser network byte limit reached.");
    const html = await Promise.race([
      view.webContents.executeJavaScript(
        "'<!doctype html>\\n'+document.documentElement.outerHTML",
      ),
      stopped,
    ]);
    return { html, resources: [...resources] };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    if (!view.isDestroyed()) view.destroy();
    isolated.webRequest.onBeforeRequest(null);
    await isolated.clearStorageData();
    await isolated.closeAllConnections();
  }
}
module.exports = { renderPage };
