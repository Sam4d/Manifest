const { app, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const assert = require("node:assert/strict");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pagetrace-engine-ui-"));
  app.setPath("userData", path.join(root, "profile"));
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    if (req.url === "/core.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end('console.log("core");');
    }
    if (req.url === "/clip.mp4") {
      res.setHeader("Content-Type", "video/mp4");
      return res.end(Buffer.alloc(1024));
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<title>Full pipeline</title><main><h1>Pipeline</h1><script src="core.js"></script><video src="clip.mp4"></video></main>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
  const timeout = setTimeout(() => {
    console.error("HTTrack desktop pipeline timed out");
    app.exit(1);
  }, 60000);
  app.on("browser-window-created", (_event, window) => {
    window.webContents.once("did-finish-load", async () => {
      try {
        const run = (code) => window.webContents.executeJavaScript(code);
        await run(
          `document.getElementById('capture-urls').value='http://127.0.0.1:${server.address().port}/';document.getElementById('capture-mode').value='httrack';document.getElementById('capture-depth').value='2';document.getElementById('capture-start').click()`,
        );
        let done = false;
        for (let i = 0; i < 500; i++) {
          if (
            await run(
              "!document.getElementById('capture-start').disabled && !document.getElementById('capture-results').hidden",
            )
          ) {
            done = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(
          done,
          await run("document.getElementById('message').textContent"),
        );
        assert.match(
          await run("document.getElementById('capture-sites').textContent"),
          /Reconstruction kit ready/,
        );
        const project = path.join(
          root,
          (await fs.readdir(root)).find((n) =>
            n.startsWith("PageTrace-capture-"),
          ),
        );
        const kit = path.join(
          project,
          (await fs.readdir(project)).find((n) => n.startsWith("PageTrace-")),
        );
        assert.ok(
          JSON.parse(await fs.readFile(path.join(kit, "schema.json"), "utf8"))
            .pages.length,
        );
        assert.match(
          await fs.readFile(path.join(kit, "report.html"), "utf8"),
          /Website relationship diagram/,
        );
        assert.match(
          await fs.readFile(path.join(kit, "site-map.svg"), "utf8"),
          /<svg/,
        );
        console.log(
          "HTTrack desktop PASS: renderer → native engine → full capture → automatic essentials/schema/diagram export.",
        );
        clearTimeout(timeout);
        window.destroy();
        server.closeAllConnections();
        server.close();
        await fs.rm(root, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    });
  });
  require("../src/main.cjs");
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
