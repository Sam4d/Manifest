const { parentPort } = require("node:worker_threads");
const { references, htmlStructure } = require("./source-parser.cjs");
parentPort.on("message", async ({ id, text, extension }) => {
  try {
    const parsed = { references: references(text, extension) };
    if (extension === ".html" || extension === ".htm")
      parsed.structure = await htmlStructure(text);
    parentPort.postMessage({ id, parsed });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
