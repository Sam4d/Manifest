// Integration with a real locally installed HTTrack engine. No public network needed.
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { captureHTTrack } = require("../src/httrack-engine.cjs");
const { scan, exportBundle } = require("../src/scanner.cjs");
const { options } = require("../src/capture.cjs");
(async () => {
  const executable = process.argv[2];
  if (!executable) throw Error("Pass the installed httrack CLI path.");
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pagetrace-real-httrack-"),
  );
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end("body{color:green}");
    }
    if (req.url === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end('console.log("core");');
    }
    if (req.url === "/movie.mp4") {
      res.setHeader("Content-Type", "video/mp4");
      return res.end(Buffer.alloc(2048));
    }
    if (req.url === "/" || req.url === "/about.html") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        '<title>Engine fixture</title><link rel="stylesheet" href="style.css"><main><h1>Hello</h1><a href="about.html">About</a><video src="movie.mp4"></video><script src="app.js"></script></main>',
      );
    }
    res.statusCode = 404;
    res.end("missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const mirror = path.join(root, "full");
    await captureHTTrack(
      executable,
      `http://127.0.0.1:${server.address().port}/`,
      mirror,
      options({ maxDepth: 3, delayMs: 0, timeoutMs: 5000, maxBytes: 10485760 }),
      { signal: controller.signal },
    );
    controller.signal.throwIfAborted();
    const analysis = await scan(mirror, { httrack: true });
    assert.ok(
      analysis.pages.length >= 2,
      "Real engine must capture linked pages",
    );
    assert.ok(
      analysis.files.some((f) => f.path.endsWith(".mp4")),
      "Full mirror must include media",
    );
    assert.ok(
      analysis.files.find((f) => f.path.endsWith("app.js"))?.decision ===
        "keep",
    );
    assert.ok(
      analysis.files.find((f) => f.path.endsWith(".mp4"))?.decision === "omit",
    );
    const kit = await exportBundle(analysis, root);
    assert.ok(
      JSON.parse(await fs.readFile(path.join(kit.path, "schema.json"), "utf8"))
        .relationships.length,
    );
    assert.match(
      await fs.readFile(path.join(kit.path, "site-map.svg"), "utf8"),
      /<svg/,
    );
    console.log(
      "Real HTTrack PASS: downloads HTML, CSS, JS and media; preserves full mirror; exports essentials, schema and diagram.",
    );
  } finally {
    clearTimeout(timeout);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
