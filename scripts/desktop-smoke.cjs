// Real Electron integration check. Use a desktop or xvfb-run on Linux.
const { app, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const screenshots = process.argv.includes("--screenshots");
const output = path.join(__dirname, "../docs/images");
async function waitFor(window, expression) {
  for (let i = 0; i < 300; i++) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Timed out: " + expression);
}
(async () => {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "siteatlas-desktop-"),
  );
  app.setPath("userData", path.join(temporary, "profile"));
  const source = path.join(temporary, "website"),
    out = path.join(temporary, "exports");
  await fs.mkdir(source);
  await fs.mkdir(out);
  await fs.writeFile(
    path.join(source, "index.html"),
    '<title>Desktop fixture</title><main><h1>Hello SiteAtlas</h1><video src="movie.mp4"></video></main>',
  );
  await fs.writeFile(path.join(source, "movie.mp4"), Buffer.alloc(1024));
  let picks = 0;
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [picks++ === 0 ? source : out],
  });
  const timer = setTimeout(() => {
    console.error("Desktop smoke test timeout");
    app.exit(1);
  }, 45000);
  app.on("browser-window-created", (_event, window) => {
    const errors = [];
    window.webContents.on("console-message", (event) => {
      if (event.level === "error") errors.push(event.message);
    });
    window.webContents.once("did-finish-load", async () => {
      try {
        const run = (code) => window.webContents.executeJavaScript(code);
        const screenshot = async (name) => {
          await new Promise((r) => setTimeout(r, 150));
          await fs.writeFile(
            path.join(output, name + ".png"),
            (await window.webContents.capturePage()).toPNG(),
          );
        };
        if (screenshots) {
          await fs.mkdir(output, { recursive: true });
          window.setSize(1560, 1520);
          await screenshot("01-welcome");
        }
        assert.equal(
          await run("document.getElementById('export').disabled"),
          true,
        );
        // Invalid input gives a useful error instead of opening a native dialog.
        await run(
          "document.getElementById('threshold').value='0';document.getElementById('scan').click()",
        );
        assert.match(
          await run("document.getElementById('message').textContent"),
          /between 1 and 1000/,
        );
        await run(
          "document.getElementById('threshold').value='5';document.getElementById('scan').click()",
        );
        await waitFor(
          window,
          "document.getElementById('project-state').textContent==='SCAN COMPLETE'",
        );
        assert.equal(
          await run("document.getElementById('pages-count').textContent"),
          "1",
        );
        await run("document.querySelector('[data-view=pages]').click()");
        assert.equal(
          await run("document.querySelector('.page-card h2').textContent"),
          "Desktop fixture",
        );
        await run(
          "document.querySelector('[data-view=files]').click();document.getElementById('search').value='movie';document.getElementById('search').dispatchEvent(new Event('input'))",
        );
        assert.equal(
          await run("document.querySelectorAll('#file-list tr').length"),
          1,
        );
        await run("document.querySelector('.file-open').click()");
        assert.equal(
          await run("document.getElementById('file-dialog').open"),
          true,
        );
        assert.equal(
          await run("document.getElementById('detail-name').textContent"),
          "movie.mp4",
        );
        await run(
          "document.getElementById('close-dialog').click();document.getElementById('decision-filter').value='keep';document.getElementById('decision-filter').dispatchEvent(new Event('change'))",
        );
        assert.equal(
          await run("document.querySelectorAll('#file-list tr').length"),
          0,
        );
        await run(
          "document.querySelector('[data-view=overview]').click();document.getElementById('export').click()",
        );
        await waitFor(
          window,
          "document.getElementById('message').textContent.startsWith('Exported to ')",
        );
        const exports = await fs.readdir(out);
        assert.equal(exports.length, 1);
        await fs.access(path.join(out, exports[0], "manifest.json"));
        assert.equal(
          await run("document.getElementById('open-export').hidden"),
          false,
        );
        await run("document.getElementById('help').click()");
        assert.equal(
          await run("document.getElementById('guide').hidden"),
          false,
        );
        // The built-in example uses the actual scanner on temporary sparse media fixtures.
        await run("document.getElementById('sample').click()");
        await waitFor(
          window,
          "document.getElementById('project-name').textContent==='Northstar Studio'&&!document.getElementById('scan').disabled",
        );
        assert.equal(
          await run("document.getElementById('pages-count').textContent"),
          "3",
        );
        assert.equal(
          await run("document.getElementById('open-export').hidden"),
          true,
        );
        window.setSize(1060, 760);
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          await run(
            "document.documentElement.scrollWidth <= window.innerWidth",
          ),
          true,
          "Compact view must not overflow horizontally",
        );
        assert.equal(
          await run(
            "document.getElementById('export').getBoundingClientRect().bottom <= window.innerHeight",
          ),
          true,
          "Export action must stay visible in compact view",
        );
        if (screenshots) {
          window.setSize(1560, 1520);
          await screenshot("02-overview");
          await run(
            "document.querySelector('[data-view=pages]').click();document.querySelector('.page-card details').open=true",
          );
          await screenshot("03-structure");
          await run("document.querySelector('[data-view=files]').click()");
          await screenshot("04-files");
          await run("document.querySelector('[data-view=insights]').click()");
          await screenshot("05-insights");
          await run("document.getElementById('help').click()");
          await screenshot("06-guide");
        }
        assert.equal(errors.length, 0, errors.join("\n"));
        console.log(
          "Desktop smoke PASS: renderer, native dialogs, scan, validation, navigation, filters, file inspector, export, guide, and real sample scan.",
        );
        clearTimeout(timer);
        window.destroy();
        await fs.rm(temporary, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
        app.exit(0);
      } catch (e) {
        console.error(e);
        clearTimeout(timer);
        app.exit(1);
      }
    });
  });
  require("../src/main.cjs");
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
