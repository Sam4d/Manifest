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
    path.join(os.tmpdir(), "pagetrace-desktop-"),
  );
  app.setPath("userData", path.join(temporary, "profile"));
  const source = path.join(temporary, "website"),
    out = path.join(temporary, "exports");
  await fs.mkdir(source);
  await fs.mkdir(out);
  await fs.writeFile(
    path.join(source, "index.html"),
    '<title>Desktop fixture</title><main><h1>Hello PageTrace</h1><video src="movie.mp4"></video></main>',
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
  }, 60000);
  app.on("browser-window-created", (_event, window) => {
    const errors = [];
    window.webContents.on("console-message", (event) => {
      if (event.level === "error") errors.push(event.message);
    });
    window.webContents.once("did-finish-load", async () => {
      try {
        const run = (code) => window.webContents.executeJavaScript(code);
        const screenshot = async (name) => {
          await new Promise((r) => setTimeout(r, 250));
          await fs.writeFile(
            path.join(output, name + ".png"),
            (await window.webContents.capturePage()).toPNG(),
          );
        };
        await run("document.querySelector('[data-appearance=dark]').click()");
        assert.equal(
          await run("document.documentElement.dataset.theme"),
          "dark",
        );
        await new Promise((resolve) => {
          window.webContents.once("did-finish-load", resolve);
          window.webContents.reload();
        });
        assert.equal(
          await run("document.documentElement.dataset.themeMode"),
          "dark",
          "Appearance persists after reload",
        );
        assert.equal(
          await run("getComputedStyle(document.body).backgroundColor"),
          "rgb(10, 21, 18)",
        );
        await run("document.querySelector('[data-appearance=light]').click()");
        assert.equal(
          await run(
            "getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()",
          ),
          "#00674f",
        );
        if (screenshots) {
          await fs.mkdir(output, { recursive: true });
          window.setSize(1560, 1520);
          await screenshot("01-welcome");
        }
        assert.equal(
          await run("document.getElementById('export').disabled"),
          true,
        );
        assert.equal(
          await run("document.getElementById('httrack-full').checked"),
          true,
        );
        await run("document.getElementById('httrack-full').click()");
        assert.equal(
          await run("document.getElementById('capture-depth').disabled"),
          false,
        );
        assert.equal(
          await run("document.getElementById('capture-depth').value"),
          "0",
        );
        assert.equal(
          await run("document.getElementById('capture-mb').checkValidity()"),
          true,
        );
        await run(
          "document.getElementById('capture-depth').value='8';document.getElementById('httrack-full').click()",
        );
        assert.equal(
          await run("document.getElementById('capture-depth').value"),
          "0",
        );
        assert.equal(
          await run(
            "document.getElementById('capture-depth').closest('label').hidden",
          ),
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
        await run(
          "document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))",
        );
        assert.equal(await run("document.activeElement.id"), "search");
        await run(
          "document.getElementById('file-sort').value='largest';document.getElementById('file-sort').dispatchEvent(new Event('change'))",
        );
        assert.match(
          await run("document.querySelector('#file-list tr td').textContent"),
          /studio-reel/,
        );
        await run(
          "document.querySelector('[data-view=pages]').click();document.getElementById('expand-outlines').click()",
        );
        assert.equal(
          await run(
            "[...document.querySelectorAll('.page-card details')].every(d=>d.open)",
          ),
          true,
        );
        await run(
          "document.getElementById('expand-outlines').click();document.querySelector('[data-view=overview]').click()",
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
          await run(
            "document.querySelector('[data-appearance=dark]').click();document.querySelector('[data-view=overview]').click()",
          );
          await screenshot("07-dark-overview");
          await run("document.querySelector('[data-view=pages]').click()");
          await screenshot("08-dark-structure");
          await run("document.querySelector('[data-view=files]').click()");
          await screenshot("09-dark-files");
          await run(
            "document.getElementById('search').value='index.html';document.getElementById('search').dispatchEvent(new Event('input'));document.querySelector('.file-open').click()",
          );
          await screenshot("10-dark-inspector");
          await run(
            "document.getElementById('close-dialog').click();document.querySelector('[data-appearance=light]').click()",
          );
        }
        await fs.mkdir(path.join(source, "hts-cache"));
        await fs.writeFile(
          path.join(source, "hts-cache/winprofile.ini"),
          "password=not-exported",
        );
        await fs.writeFile(path.join(source, "hts-log.txt"), "private log");
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [source],
        });
        await run(
          "document.querySelector('[data-view=overview]').click();document.getElementById('import-httrack').click()",
        );
        await waitFor(
          window,
          "document.getElementById('message').textContent.includes('HTTrack mirror imported')",
        );
        assert.equal(
          await run("document.getElementById('pages-count').textContent"),
          "1",
        );
        assert.equal(
          await run("document.getElementById('import-httrack').disabled"),
          false,
        );
        if (screenshots) {
          window.setSize(1560, 1520);
          await run(
            "document.querySelector('[data-appearance=light]').click()",
          );
          await screenshot("14-httrack-import");
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
