const { Worker } = require("node:worker_threads");
const path = require("node:path");
class FileParser {
  constructor({
    signal,
    timeoutMs = 3000,
    workerPath = path.join(__dirname, "parse-worker.cjs"),
  } = {}) {
    this.signal = signal;
    this.timeoutMs = timeoutMs;
    this.workerPath = workerPath;
    this.nextId = 0;
    this.worker = null;
    this.pending = null;
    this.abort = () =>
      this.reset(
        Object.assign(new Error("Scan cancelled"), { name: "AbortError" }),
      );
    signal?.addEventListener("abort", this.abort, { once: true });
  }
  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerPath);
    this.worker = worker;
    worker.on("message", (message) => {
      if (this.worker !== worker || this.pending?.id !== message.id) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      if (message.error) pending.reject(Error(message.error));
      else pending.resolve(message.parsed);
    });
    worker.on("error", (error) => {
      if (this.worker === worker) this.reset(error);
    });
    worker.on("exit", (code) => {
      if (this.worker === worker)
        this.reset(Error(`Source parser exited (${code})`));
    });
    return worker;
  }
  parse(text, extension) {
    this.signal?.throwIfAborted();
    if (this.pending)
      return Promise.reject(Error("Parser is already processing a file"));
    return new Promise((resolve, reject) => {
      const worker = this.ensureWorker(),
        id = ++this.nextId;
      const timer = setTimeout(
        () =>
          this.reset(
            Object.assign(
              Error(`Source parsing exceeded ${this.timeoutMs} ms`),
              { code: "PARSE_TIMEOUT" },
            ),
          ),
        this.timeoutMs,
      );
      this.pending = { id, resolve, reject, timer };
      try {
        worker.postMessage({ id, text, extension });
      } catch (error) {
        this.reset(error);
      }
    });
  }
  reset(error) {
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    const worker = this.worker;
    this.worker = null;
    if (worker) worker.terminate().catch(() => {});
  }
  async close() {
    this.signal?.removeEventListener("abort", this.abort);
    const worker = this.worker;
    this.worker = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(Error("Source parser closed"));
      this.pending = null;
    }
    if (worker) await worker.terminate();
  }
}
module.exports = { FileParser };
