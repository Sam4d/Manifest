// Fail packaging rather than publish a PageTrace app with a missing downloader.
const path = require("node:path");
exports.default = async (context) => {
  if (context.electronPlatformName !== "win32") return;
  const directory = path.join(context.appOutDir, "resources", "httrack");
  try {
    await require("../src/capture-runtime.cjs").verifyWindowsRuntime(directory);
  } catch (error) {
    throw Error(
      "PageTrace Windows packaging rejected: its included downloader is incomplete. Build the runtime using scripts/build-httrack.ps1 before packaging.",
      { cause: error },
    );
  }
};
