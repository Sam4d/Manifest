// PageTrace owns and ships its capture runtime. Never ask users to locate tools.
const fs = require("node:fs/promises");
const path = require("node:path");
const INCOMPLETE =
  "PageTrace’s download component is incomplete. Install the complete PageTrace release and open it again.";
async function verifyWindowsRuntime(directory) {
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(directory, "runtime.json"), "utf8"),
    );
    if (
      !Array.isArray(manifest.files) ||
      !["httrack.exe", "libhttrack.dll"].every((name) =>
        manifest.files.some((file) => file.name === name),
      )
    )
      throw Error("Missing runtime entries");
    for (const file of manifest.files) {
      if (
        typeof file.name !== "string" ||
        !/^[a-zA-Z0-9_.-]+$/.test(file.name) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes <= 0
      )
        throw Error("Invalid runtime entry");
      const stat = await fs.stat(path.join(directory, file.name));
      if (!stat.isFile() || stat.size !== file.bytes)
        throw Error("Incomplete runtime file");
    }
    return path.join(directory, "httrack.exe");
  } catch (error) {
    throw Error(INCOMPLETE, { cause: error });
  }
}
async function resolveCaptureRuntime({
  packaged,
  resourcesPath,
  appRoot,
  platform = process.platform,
}) {
  const directory = path.join(
    packaged ? resourcesPath : path.join(appRoot, "vendor"),
    "httrack",
  );
  if (platform === "win32") return verifyWindowsRuntime(directory);
  const executable = path.join(directory, "httrack");
  try {
    if (!(await fs.stat(executable)).isFile()) throw Error("Missing runtime");
  } catch (error) {
    throw Error(INCOMPLETE, { cause: error });
  }
  return executable;
}
module.exports = { resolveCaptureRuntime, verifyWindowsRuntime };
