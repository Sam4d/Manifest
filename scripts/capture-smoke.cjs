const { app, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const assert = require("node:assert/strict");
(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pagetrace-capture-desktop-"),
  );
  app.setPath("userData", path.join(root, "profile"));
  const out = path.join(root, "captures");
  await fs.mkdir(out);
  const server = http.createServer((req, res) => {
    if (process.env.PAGETRACE_DEBUG) console.log("Fixture request", req.url);
    if (req.url === "/slow") return;
    if (req.url === "/robots.txt") {
      res.setHeader("Content-Type", "text/plain");
      return res.end("User-agent: *\nAllow: /");
    }
    if (req.url === "/sitemap.xml") {
      res.setHeader("Content-Type", "application/xml");
      return res.end("<urlset></urlset>");
    }
    if (req.url === "/asset.svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="green"/></svg>',
      );
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<title>PageTrace capture fixture</title><main id="content"></main><script>document.getElementById("content").innerHTML="<h1>Rendered website capture</h1><p>This content was created by JavaScript.</p><img src=\\"/asset.svg\\">";if(typeof require!=="undefined")throw Error("Node exposed");</script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const timer = setTimeout(() => {
    console.error("Capture desktop timeout");
    app.exit(1);
  }, 90000);
  let handled = false;
  app.on("browser-window-created", (_event, window) => {
    if (handled) {
      const prefs = window.webContents.getLastWebPreferences();
      assert.equal(prefs.nodeIntegration, false);
      assert.equal(prefs.sandbox, true);
      assert(!prefs.preload);
      return;
    }
    handled = true;
    window.webContents.once("did-finish-load", async () => {
      const run = (code) => window.webContents.executeJavaScript(code);
      async function wait(expression) {
        for (let i = 0; i < 1200; i++) {
          if (await run(expression)) return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw Error("Timed out: " + expression);
      }
      async function screenshot(name) {
        if (!process.argv.includes("--screenshots")) return;
        await new Promise((r) => setTimeout(r, 250));
        await fs.writeFile(
          path.join(__dirname, "../docs/images", name + ".png"),
          (await window.webContents.capturePage()).toPNG(),
        );
      }
      try {
        const { renderPage } = require("../src/browser-capture.cjs");
        await assert.rejects(
          renderPage(
            url + "/slow",
            new AbortController().signal,
            async () => true,
            { timeoutMs: 150 },
          ),
          /timed out/,
        );
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [out],
        });
        window.setSize(1440, 1100);
        await run(
          `document.getElementById('capture-urls').value=${JSON.stringify(url + "/\n" + url + "/second")};document.getElementById('capture-mode').value='browser';document.getElementById('capture-delay').value='0'`,
        );
        await screenshot("11-capture-setup");
        await run("document.getElementById('capture-start').click()");
        await wait(
          "!document.getElementById('capture-results').hidden&&!document.getElementById('capture-start').disabled",
        );
        assert.equal(
          await run("document.querySelectorAll('.capture-site').length"),
          2,
        );
        const [projectName] = await fs.readdir(out),
          projectDir = path.join(out, projectName);
        const project = JSON.parse(
          await fs.readFile(path.join(projectDir, "project.json"), "utf8"),
        );
        assert.equal(project.sites.length, 2);
        for (const site of project.sites) {
          const dir = path.join(projectDir, site.folder),
            state = JSON.parse(
              await fs.readFile(path.join(dir, "capture.json"), "utf8"),
            );
          const home = state.records.find((r) => r.url === site.url);
          assert(home.renderedFile, "Browser produced a DOM snapshot");
          assert(
            (
              await fs.readFile(path.join(dir, "mirror", home.file), "utf8")
            ).includes("<h1>Rendered website capture</h1>"),
          );
          assert(state.records.some((r) => r.url.endsWith("/asset.svg")));
          assert.equal(state.status, "complete");
        }
        await run(
          "document.getElementById('capture-results').scrollIntoView({block:'center'})",
        );
        await screenshot("12-capture-results");
        await run("document.querySelector('.capture-site button').click()");
        await wait(
          "document.getElementById('project-state').textContent==='SCAN COMPLETE'&&!document.getElementById('scan').disabled",
        );
        assert.equal(
          await run("document.getElementById('pages-count').textContent"),
          "1",
        );
        await run(
          "document.querySelector('[data-view=pages]').click();document.getElementById('pages').scrollIntoView({block:'start'})",
        );
        assert.equal(
          await run("document.querySelector('.page-card h2').textContent"),
          "PageTrace capture fixture",
        );
        await screenshot("13-captured-structure");
        // Resume uses a user-selected saved project, including after a renderer reload.
        await new Promise((resolve) => {
          window.webContents.once("did-finish-load", resolve);
          window.webContents.reload();
        });
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [projectDir],
        });
        await run("document.getElementById('resume-capture').click()");
        await wait(
          "!document.getElementById('capture-results').hidden&&!document.getElementById('resume-capture').disabled",
        );
        assert.equal(
          await run("document.querySelectorAll('.capture-site').length"),
          2,
        );
        console.log(
          "Capture desktop PASS: two sites, isolated JavaScript rendering, assets, original + mirror, analyze and persisted project resume.",
        );
        clearTimeout(timer);
        window.destroy();
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
        await fs.rm(root, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
        app.exit(0);
      } catch (e) {
        console.error(e);
        clearTimeout(timer);
        server.close();
        app.exit(1);
      }
    });
  });
  require("../src/main.cjs");
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
