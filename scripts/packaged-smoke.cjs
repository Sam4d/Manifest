// Black-box test: launch the actual executable and drive its real renderer over CDP.
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
(async () => {
  const executable = process.argv[2];
  if (!executable)
    throw Error(
      "Usage: node scripts/packaged-smoke.cjs EXECUTABLE [APP_ARGUMENTS...]",
    );
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "pagetrace-packaged-"),
  );
  const port = await freePort();
  let child,
    ws,
    log = "",
    id = 0;
  const pending = new Map();
  let state;
  try {
    child = spawn(
      path.resolve(executable),
      [
        ...process.argv.slice(3),
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    child.on("error", (error) => {
      log += "\n" + error.message;
    });
    for (const stream of [child.stdout, child.stderr])
      stream?.on("data", (chunk) => {
        log = (log + chunk.toString()).slice(-16000);
      });
    let target;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(1000),
        });
        const pages = await response.json();
        target = pages.find(
          (p) => p.type === "page" && p.url.includes("index.html"),
        );
        if (target) break;
      } catch {}
      await delay(250);
    }
    if (!target)
      throw Error(
        "Packaged executable never exposed its application window. " + log,
      );
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        clearTimeout(request.timer);
        message.error
          ? request.reject(Error(message.error.message))
          : request.resolve(message.result);
      }
    });
    const command = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(Error("CDP command timed out: " + method));
        }, 10000);
        pending.set(requestId, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: requestId, method, params }));
      });
    const evaluate = async (expression) => {
      const result = await command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await command("Runtime.enable");
    assert.match(await evaluate("document.title"), /PageTrace/);
    await evaluate("document.getElementById('sample').click()");
    for (let attempt = 0; attempt < 240; attempt++) {
      state = await evaluate(
        "({name:document.getElementById('project-name').textContent,busy:document.getElementById('scan').disabled,pages:document.getElementById('pages-count').textContent,message:document.getElementById('message').textContent,progress:document.getElementById('progress-detail').textContent})",
      );
      if (!state.busy) break;
      await delay(250);
    }
    assert.equal(
      state.busy,
      false,
      "Packaged sample scan never finished: " + JSON.stringify(state),
    );
    assert.equal(state.name, "Northstar Studio", JSON.stringify(state));
    assert.equal(
      state.pages,
      "3",
      "Packaged parser failed: " + JSON.stringify(state),
    );
    await evaluate(
      "document.querySelector('[data-view=files]').click();document.getElementById('search').value='index.html';document.getElementById('search').dispatchEvent(new Event('input'))",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('#file-list tr').length"),
      3,
    );
    await evaluate("document.querySelector('[data-appearance=dark]').click()");
    assert.equal(
      await evaluate("document.documentElement.dataset.theme"),
      "dark",
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      await fs.appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `
### Packaged executable check: ${path.basename(executable)}

Passed: real launch, packaged sample scan completed with 3 HTML pages, file search, and dark mode.
`,
      );
    console.log(
      "PACKAGED PASS: executable boot, packaged preload, native sample creation, ASAR parser, completed scan with 3 pages, file search, and dark mode.",
    );
    await command("Browser.close").catch(() => {});
  } catch (error) {
    if (process.env.GITHUB_STEP_SUMMARY)
      await fs
        .appendFile(
          process.env.GITHUB_STEP_SUMMARY,
          `
### Packaged executable check failed: ${path.basename(executable)}

\`\`\`json
${JSON.stringify({ error: error.message, state, log }, null, 2)}
\`\`\`
`,
        )
        .catch(() => {});
    console.error(log);
    throw error;
  } finally {
    ws?.close();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Browser closed"));
    }
    pending.clear();
    await delay(1000);
    if (child && child.exitCode === null) child.kill();
    await fs
      .rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      })
      .catch(() => {});
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
