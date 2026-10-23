const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { inspectProject } = require("../src/httrack-import.cjs");
const { scan, exportBundle, report } = require("../src/scanner.cjs");

test("HTTrack import excludes private cache and exports host pages with relative links", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pagetrace-httrack-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const site = path.join(root, "project");
  await fs.mkdir(path.join(site, "hts-cache"), { recursive: true });
  await fs.mkdir(path.join(site, "example.com"));
  await fs.writeFile(
    path.join(site, "hts-cache/winprofile.ini"),
    "password=MUST_NOT_EXPORT",
  );
  await fs.writeFile(path.join(site, "hts-cache/new.zip"), "MUST_NOT_EXPORT");
  await fs.writeFile(path.join(site, "hts-log.txt"), "MUST_NOT_EXPORT");
  await fs.writeFile(
    path.join(site, "example.com/index.html"),
    '<title>Saved website</title><main><h1>Hello</h1><a href="about.html">About</a></main>',
  );
  await fs.writeFile(
    path.join(site, "example.com/about.html"),
    "<h1>About</h1>",
  );
  const metadata = await inspectProject(site);
  const result = await scan(site, { httrack: true });
  result.import = metadata;
  assert.equal(result.pages.length, 2);
  assert.equal(result.files.length, 2);
  assert.equal(result.skipped.length, 2);
  assert.match(report(result), /Imported mirror/);
  const bundle = await exportBundle(result, root);
  const manifest = await fs.readFile(
    path.join(bundle.path, "manifest.json"),
    "utf8",
  );
  assert.equal(JSON.parse(manifest).import.tool, "HTTrack");
  assert.doesNotMatch(manifest, /MUST_NOT_EXPORT/);
  assert.match(
    await fs.readFile(
      path.join(bundle.path, "lightweight/example.com/index.html"),
      "utf8",
    ),
    /href="about.html"/,
  );
  await assert.rejects(
    fs.stat(path.join(bundle.path, "lightweight/hts-cache")),
  );
  assert.equal(
    await fs.readFile(path.join(site, "hts-cache/new.zip"), "utf8"),
    "MUST_NOT_EXPORT",
  );
});
test("HTTrack import rejects arbitrary folders, empty caches and non-directory caches", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pagetrace-httrack-invalid-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(inspectProject(root), /containing hts-cache/);
  await fs.mkdir(path.join(root, "hts-cache"));
  await assert.rejects(inspectProject(root), /no recognizable/);
  // A file masquerading as a cache directory must also be rejected on every OS.
  await fs.rmdir(path.join(root, "hts-cache"));
  await fs.writeFile(path.join(root, "hts-cache"), "not a directory");
  await assert.rejects(inspectProject(root), /containing hts-cache/);
});
test("schema preserves dependency edges and diagrams escape website-controlled labels", () => {
  const { schema, diagram } = require("../src/site-schema.cjs");
  const s = {
    name: "<script>bad</script>",
    pages: [
      {
        path: "index.html",
        title: '<img onerror="bad">',
        layout: [],
        headings: [],
      },
    ],
    files: [
      {
        path: "index.html",
        extension: ".html",
        decision: "keep",
        reason: "source",
        references: [{ resolved: "app.js", kind: "local" }],
      },
    ],
  };
  assert.deepEqual(schema(s).relationships, [
    { from: "index.html", to: "app.js", kind: "local" },
  ]);
  assert.doesNotMatch(diagram(s), /<script>|<img/);
  assert.match(diagram(s), /&lt;script&gt;/);
});
test("HTTrack command uses separate arguments and does not exclude media from full capture", () => {
  const { argumentsFor } = require("../src/httrack-engine.cjs");
  const { options } = require("../src/capture.cjs");
  const args = argumentsFor(
    "https://example.com/",
    "C:\\saved sites\\test",
    options({ mode: "httrack" }),
  );
  assert.equal(args[args.indexOf("-O") + 1], "C:\\saved sites\\test");
  assert.ok(args.includes("-%P"));
  assert.ok(!args.some((a) => a.includes("*.mp4")));
  assert.throws(
    () => argumentsFor("file:///tmp/site", "/tmp/out", options()),
    /HTTP/,
  );
});
