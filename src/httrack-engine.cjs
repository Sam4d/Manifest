// Run the separately installed HTTrack CLI without a command shell.
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
function argumentsFor(url, directory, opts, resume = false) {
  const parsed = new URL(url);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw Error("Use a public HTTP(S) URL without credentials.");
  return [
    url,
    "-O",
    directory,
    resume ? "-i" : "-w",
    ...(opts.httrackFull
      ? []
      : [
          ...(opts.maxDepth > 0 ? ["-r" + opts.maxDepth] : []),
          ...(opts.maxBytes > 0 ? ["-M" + opts.maxBytes] : []),
          ...(opts.maxFileBytes > 0
            ? ["-m" + opts.maxFileBytes + "," + opts.maxFileBytes]
            : []),
        ]),
    "-R" + opts.retries,
    "-%P",
    "-n",
    "-q",
  ];
}
async function captureHTTrack(
  executable,
  url,
  directory,
  opts,
  { signal, progress = () => {} } = {},
) {
  signal?.throwIfAborted();
  await fs.mkdir(directory, { recursive: true });
  let resume = false;
  try {
    resume = (await fs.stat(path.join(directory, "hts-cache"))).isDirectory();
  } catch {}
  // The child already runs inside the output directory. HTTrack interprets a
  // comma in -O as a separate cache path, so use a relative dot for arbitrary folder names.
  const args = argumentsFor(url, ".", opts, resume);
  let tail = "",
    code;
  await new Promise((resolve, reject) => {
    const child = spawn(path.resolve(executable), args, {
      cwd: directory,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let killer;
    const heartbeat = setInterval(
      () =>
        progress({
          phase: "httrack-download",
          currentPath:
            tail
              .split(/[\r\n]/)
              .filter(Boolean)
              .at(-1)
              ?.slice(0, 240) || url,
        }),
      500,
    );
    heartbeat.unref();
    const cancel = () => {
      child.kill("SIGTERM");
      killer = setTimeout(() => child.kill("SIGKILL"), 3000);
      killer.unref();
    };
    const output = (chunk) => {
      tail = (tail + chunk.toString()).slice(-4096);
      progress({
        phase: "httrack-download",
        currentPath:
          tail
            .split(/[\r\n]/)
            .filter(Boolean)
            .at(-1)
            ?.slice(0, 240) || url,
      });
    };
    child.stdout.on("data", output);
    child.stderr.on("data", output);
    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(killer);
      signal?.removeEventListener("abort", cancel);
    };
    child.once("error", (error) => {
      cleanup();
      reject(Error("Could not start HTTrack CLI: " + error.message));
    });
    child.once("close", (exitCode) => {
      cleanup();
      code = exitCode;
      resolve();
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
  await fs.writeFile(
    path.join(directory, "PAGETRACE-HTTRACK.json"),
    JSON.stringify(
      { engine: "HTTrack", url, exitCode: code, paused: !!signal?.aborted },
      null,
      2,
    ),
  );
  if (!signal?.aborted && code !== 0)
    throw Error(
      `HTTrack exited with code ${code}. Inspect hts-log.txt in ${directory}.`,
    );
  return { mirror: directory, paused: !!signal?.aborted };
}
module.exports = { argumentsFor, captureHTTrack };
