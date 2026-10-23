// Runs inside the black-box packaged executable check. No production test bypasses.
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
module.exports = async function check(evaluate, profile) {
  const destination = path.join(profile, "captures");
  await fs.mkdir(destination);
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    if (req.url === "/core.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end('console.log("core");');
    }
    if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end("body{color:#00674f}");
    }
    if (req.url === "/movie.mp4") {
      res.setHeader("Content-Type", "video/mp4");
      return res.end(Buffer.alloc(2048));
    }
    if (req.url === "/" || req.url === "/about.html") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        '<title>Packaged PageTrace capture</title><link rel="stylesheet" href="style.css"><main><h1>PageTrace</h1><a href="about.html">About</a><video src="movie.mp4"></video><script src="core.js"></script></main>',
      );
    }
    res.statusCode = 404;
    res.end("missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let picker,
    log = "";
  try {
    picker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(__dirname, "windows-capture-folder.ps1"),
        "-Destination",
        destination,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const picked = new Promise((resolve, reject) => {
      picker.once("error", reject);
      picker.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(Error("Native output-folder check failed: " + log)),
      );
    });
    picked.catch(() => {});
    for (const stream of [picker.stdout, picker.stderr])
      stream.on("data", (chunk) => {
        log = (log + chunk).slice(-5000);
      });
    await evaluate(
      `document.querySelector('[data-view=overview]').click();document.getElementById('capture-urls').value='http://127.0.0.1:${server.address().port}/';document.getElementById('capture-start').click()`,
    );
    await picked;
    let state;
    for (let attempt = 0; attempt < 240; attempt++) {
      state = await evaluate(
        "({busy:document.getElementById('capture-start').disabled,message:document.getElementById('message').textContent,results:document.getElementById('capture-sites').textContent})",
      );
      if (!state.busy) break;
      await delay(250);
    }
    assert.equal(state.busy, false, JSON.stringify(state));
    assert.match(
      state.message,
      /essentials folder, schema, diagram and report are ready/,
      JSON.stringify(state),
    );
    const project = path.join(
      destination,
      (await fs.readdir(destination)).find((name) =>
        name.startsWith("PageTrace-capture-"),
      ),
    );
    const kit = path.join(
      project,
      (await fs.readdir(project)).find((name) => name.startsWith("PageTrace-")),
    );
    const manifest = JSON.parse(
      await fs.readFile(path.join(kit, "manifest.json"), "utf8"),
    );
    assert.ok(
      manifest.files.some(
        (file) => file.path.endsWith("core.js") && file.decision === "keep",
      ),
    );
    assert.ok(
      manifest.files.some(
        (file) => file.path.endsWith("movie.mp4") && file.decision === "omit",
      ),
    );
    assert.ok(
      JSON.parse(await fs.readFile(path.join(kit, "schema.json"), "utf8")).pages
        .length >= 2,
    );
    assert.match(
      await fs.readFile(path.join(kit, "site-map.svg"), "utf8"),
      /<svg/,
    );
    assert.match(
      await fs.readFile(path.join(kit, "report.html"), "utf8"),
      /Website relationship diagram/,
    );
    console.log(
      "PACKAGED CAPTURE PASS: native output picker only; bundled downloader; full website → essentials/schema/diagram/report.",
    );
  } finally {
    if (picker && picker.exitCode === null) picker.kill();
    picker?.stdout?.destroy();
    picker?.stderr?.destroy();
    picker?.unref();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};
