const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const {
  captureSite,
  robotsRules,
  robotsAllowed,
  options,
  discover,
} = require("../src/capture.cjs");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pagetrace-capture-"));
  const hits = {};
  let flaky = 0;
  const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] || 0) + 1;
    const routes = {
      "/robots.txt": [
        "text/plain",
        "User-agent: *\nDisallow: /secret\nAllow: /secret/public\n",
      ],
      "/": [
        "text/html",
        '<title>Capture fixture</title><link rel="stylesheet" href="/style.css"><a href="/about?lang=en">About</a><a href="/secret">Secret</a><img srcset="/a.png 1x, /b.png 2x"><video src="/movie.mp4"></video><script type="module" src="/app.js"></script><a href="/redirect">Redirect</a><img src="/flaky.png"><img src="/huge.png">',
      ],
      "/about?lang=en": ["text/html", '<h1>About</h1><a href="/">Home</a>'],
      "/style.css": [
        "text/css",
        '@import "/more.css"; body {background:url(/a.png)}',
      ],
      "/more.css": ["text/css", "h1{color:red}"],
      "/app.js": ["text/javascript", 'import "./module.js";'],
      "/module.js": ["text/javascript", 'export const greeting="hello";'],
      "/a.png": ["image/png", "image"],
      "/b.png": ["image/png", "second image"],
      "/movie.mp4": ["video/mp4", "video"],
      "/huge.png": ["image/png", "x".repeat(2048)],
    };
    if (req.url === "/flaky.png") {
      if (flaky++ === 0) {
        res.writeHead(503);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end("recovered");
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/secret" });
      return res.end();
    }
    const route = routes[req.url];
    if (!route) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "Content-Type": route[0] });
    res.end(route[1]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { dir, hits, url: `http://127.0.0.1:${server.address().port}` };
}
test("captures pages, responsive media, nested CSS, modules, retries, query URLs and rewrites saved links", async (t) => {
  const { dir, hits, url } = await fixture(t);
  const result = await captureSite(url + "/", dir, {
    delayMs: 0,
    maxFileBytes: 1024,
  });
  assert.equal(result.state.status, "partial");
  assert.equal(hits["/secret"], undefined);
  assert.equal(hits["/flaky.png"], 2);
  const saved = result.state.records.filter((r) => r.status === "saved");
  for (const suffix of [
    "/about?lang=en",
    "/a.png",
    "/b.png",
    "/movie.mp4",
    "/more.css",
    "/module.js",
  ])
    assert(
      saved.some((r) => r.url === url + suffix),
      suffix,
    );
  const home = saved.find((r) => r.url === url + "/");
  const html = await fs.readFile(path.join(result.mirror, home.file), "utf8");
  assert(!html.includes('href="/about?lang=en"'));
  assert(html.includes('srcset="'));
  assert(
    result.state.records.some(
      (r) => r.url.endsWith("/huge.png") && /limit/.test(r.reason),
    ),
  );
  const script = saved.find((r) => r.url === url + "/app.js");
  assert.match(
    await fs.readFile(path.join(result.mirror, script.file), "utf8"),
    /import \"\.\/[a-f0-9]+\.js\"/,
  );
  await fs.access(path.join(dir, "capture-report.html"));
  await fs.access(path.join(result.mirror, "PAGETRACE-CAPTURE.json"));
  const original = await fs.readFile(
    path.join(dir, "original", home.file),
    "utf8",
  );
  assert(original.includes('href="/about?lang=en"'));
  // Scanner + AI export works directly on the mirror and leaves media originals intact.
  const { scan, exportBundle } = require("../src/scanner.cjs");
  const inventory = await scan(result.mirror);
  assert.equal(inventory.pages.length, 2);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "pagetrace-ai-"));
  t.after(() => fs.rm(out, { recursive: true, force: true }));
  const kit = await exportBundle(inventory, out);
  await fs.access(path.join(kit.path, "manifest.json"));
  assert(
    inventory.files.some(
      (f) => f.extension === ".mp4" && f.decision === "omit",
    ),
  );
});
test("cancellation checkpoints a queue that resumes without downloading saved URLs again", async (t) => {
  const { dir, hits, url } = await fixture(t),
    controller = new AbortController();
  const opts = { delayMs: 0, maxFileBytes: 1024, retries: 0 };
  const first = await captureSite(url + "/", dir, opts, {
    signal: controller.signal,
    progress: (p) => {
      if (p.files === 1) controller.abort();
    },
  });
  assert.equal(first.state.status, "paused");
  assert(first.state.queue.length);
  const second = await captureSite(url + "/", dir, opts, {}, true);
  assert.equal(hits["/"], 1);
  assert(second.state.records.some((r) => r.url.endsWith("/module.js")));
});
test("page, file, byte, depth and URL filters bound capture", async (t) => {
  const { dir, url } = await fixture(t);
  const result = await captureSite(url + "/", dir, {
    delayMs: 0,
    maxPages: 1,
    maxDepth: 0,
    maxFiles: 3,
    maxBytes: 1024,
    maxFileBytes: 1024,
    exclude: "*/movie*",
  });
  assert(result.state.pages <= 1);
  assert(result.state.bytes <= 1024);
  assert(result.state.records.length <= 3);
  assert(!result.state.records.some((r) => r.url.includes("/movie")));
  assert.equal(result.state.status, "limited");
});
test("browser adapter DOM is used for discovery while network original remains preserved", async (t) => {
  const { dir, url } = await fixture(t);
  const result = await captureSite(
    url + "/",
    dir,
    {
      mode: "browser",
      delayMs: 0,
      maxPages: 1,
      maxFileBytes: 1024,
      retries: 0,
    },
    {
      render: async () => ({
        html: '<h1>Rendered by JavaScript</h1><img src="/a.png">',
        resources: [url + "/b.png"],
      }),
    },
  );
  const home = result.state.records.find((r) => r.url === url + "/");
  assert(home.renderedFile);
  assert(
    (await fs.readFile(path.join(result.mirror, home.file), "utf8")).includes(
      "Rendered by JavaScript",
    ),
  );
  assert(
    (await fs.readFile(path.join(dir, "original", home.file), "utf8")).includes(
      "Capture fixture",
    ),
  );
  assert(result.state.records.some((r) => r.url === url + "/b.png"));
});
test("robots groups, wildcards and Allow precedence; validates options", () => {
  const rules = robotsRules(
    "User-agent: *\nDisallow: /\nUser-agent: PageTrace\nDisallow: /private*\nAllow: /private/public\n",
  );
  assert(robotsAllowed("https://test/hello", rules));
  assert(!robotsAllowed("https://test/private/abc", rules));
  assert(robotsAllowed("https://test/private/public", rules));
  assert.throws(() => options({ maxDepth: -1 }));
  assert.throws(() => options({ mode: "invalid" }));
});
test("discovers base URL, inline styles, manifests and sitemap entries", async () => {
  const refs = await discover(
    '<base href="https://test/assets/"><img data-src="lazy.png"><div style="background:url(bg.png)"></div>',
    "text/html",
    "https://test/",
  );
  assert(refs.some((r) => r.url === "https://test/assets/lazy.png"));
  assert(refs.some((r) => r.url === "https://test/assets/bg.png"));
  assert(
    (
      await discover(
        "<url><loc>https://test/about</loc></url>",
        "application/xml",
        "https://test/",
      )
    )[0].page,
  );
});
test("zero download limits capture all discovered files and survive resume serialization", async (t) => {
  const { dir, url } = await fixture(t);
  const opts = {
    delayMs: 0,
    maxPages: 0,
    maxFiles: 0,
    maxDepth: 0,
    maxBytes: 0,
    maxFileBytes: 0,
  };
  const first = await captureSite(url + "/", dir, opts);
  assert.ok(first.state.pages >= 2);
  assert.ok(first.state.records.length > 3);
  const large = first.state.records.find((r) => r.url.endsWith("/huge.png"));
  assert.equal(large.status, "saved");
  assert.ok(large.bytes >= 2048);
  assert.ok(
    first.state.records.some(
      (r) => r.url.endsWith("/module.js") && r.status === "saved",
    ),
  );
  assert.notEqual(first.state.status, "limited");
  const stored = JSON.parse(
    await fs.readFile(path.join(dir, "capture.json"), "utf8"),
  );
  for (const key of [
    "maxPages",
    "maxFiles",
    "maxDepth",
    "maxBytes",
    "maxFileBytes",
  ])
    assert.equal(stored.options[key], 0);
  const resumed = await captureSite(url + "/", dir, opts, {}, true);
  assert.equal(resumed.state.records.length, first.state.records.length);
});
test("positive page limit still applies when the remaining limits are unlimited", async (t) => {
  const { dir, url } = await fixture(t);
  const result = await captureSite(url + "/", dir, {
    delayMs: 0,
    maxPages: 1,
    maxFiles: 0,
    maxDepth: 0,
    maxBytes: 0,
    maxFileBytes: 0,
  });
  assert.equal(result.state.pages, 1);
  assert.ok(
    result.state.records.some(
      (r) => r.url.endsWith("/movie.mp4") && r.status === "saved",
    ),
  );
  assert.throws(() => options({ maxBytes: -1 }));
  assert.throws(() => options({ maxFiles: 1.5 }));
  assert.equal(options({ maxBytes: 64 * 1024 ** 3 }).maxBytes, 64 * 1024 ** 3);
});
