// Interoperability with local HTTrack output; no HTTrack code or binaries bundled.
const fs = require("node:fs/promises");
const path = require("node:path");
async function inspectProject(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const cache = entries.find(
    (e) => e.name.toLowerCase() === "hts-cache" && e.isDirectory(),
  );
  if (!cache)
    throw Error(
      "Choose the HTTrack project folder containing hts-cache, not the downloaded host subfolder.",
    );
  // Never follow a cache symlink or read its configuration (which can contain credentials).
  const cacheEntries = await fs.readdir(path.join(root, cache.name), {
    withFileTypes: true,
  });
  if (
    !cacheEntries.some(
      (e) =>
        e.isFile() &&
        /^(winprofile\.ini|new\.(zip|dat|ndx|txt)|old\.(zip|dat|ndx|txt))$/i.test(
          e.name,
        ),
    )
  )
    throw Error(
      "This folder has no recognizable HTTrack project metadata. Finish a capture in HTTrack first.",
    );
  return {
    tool: "HTTrack",
    format: "local-mirror",
    importedAt: new Date().toISOString(),
    note: "Local saved files only. Cache, logs and configuration excluded. Original URLs are not inferred from host paths.",
  };
}
function excluded(relative) {
  const parts = relative.toLowerCase().split("/");
  return (
    parts.includes("hts-cache") ||
    (parts.length === 1 &&
      /^(hts-(log|err)\.txt|hts-in_progress\.lock|winprofile\.ini|cookies\.txt)$/.test(
        parts[0],
      ))
  );
}
module.exports = { inspectProject, excluded };
