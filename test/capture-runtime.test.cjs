const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {
  resolveCaptureRuntime,
  verifyWindowsRuntime,
} = require("../src/capture-runtime.cjs");
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pagetrace-runtime-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "resources", "httrack");
  await fs.mkdir(dir, { recursive: true });
  for (const file of ["httrack.exe", "libhttrack.dll", "vcruntime140.dll"])
    await fs.writeFile(path.join(dir, file), "binary-fixture");
  const files = ["httrack.exe", "libhttrack.dll", "vcruntime140.dll"].map(
    (name) => ({ name, bytes: 14 }),
  );
  await fs.writeFile(path.join(dir, "runtime.json"), JSON.stringify({ files }));
  return { root, dir, files };
}
test("packaged capture resolves only the complete runtime shipped inside PageTrace", async (t) => {
  const { root, dir } = await fixture(t);
  assert.equal(
    await resolveCaptureRuntime({
      packaged: true,
      resourcesPath: path.join(root, "resources"),
      appRoot: "/unused",
      platform: "win32",
    }),
    path.join(dir, "httrack.exe"),
  );
});
test("missing native dependencies fail clearly instead of asking for an executable", async (t) => {
  const { dir } = await fixture(t);
  await fs.rm(path.join(dir, "vcruntime140.dll"));
  await assert.rejects(
    verifyWindowsRuntime(dir),
    (error) =>
      /PageTrace.*incomplete/.test(error.message) &&
      !/CLI|httrack\.exe|select|locate/i.test(error.message),
  );
});
test("incomplete packages fail the packaging guard before publication", async (t) => {
  const { root, dir } = await fixture(t);
  await fs.rm(path.join(dir, "runtime.json"));
  await assert.rejects(
    require("../scripts/check-capture-package.cjs").default({
      electronPlatformName: "win32",
      appOutDir: root,
    }),
    /PageTrace.*incomplete/,
  );
});
test("runtime manifests cannot reference files outside the bundled component", async (t) => {
  const { dir, files } = await fixture(t);
  await fs.writeFile(
    path.join(dir, "runtime.json"),
    JSON.stringify({ files: [...files, { name: "../other.exe", bytes: 1 }] }),
  );
  await assert.rejects(verifyWindowsRuntime(dir), /PageTrace.*incomplete/);
});
