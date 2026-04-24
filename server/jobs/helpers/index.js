const path = require("node:path");
const fs = require("node:fs");
const { parentPort } = require("node:worker_threads");
const documentsPath =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, `../../storage/documents`)
    : path.resolve(process.env.STORAGE_DIR, `documents`);

function log(stringContent = "") {
  if (parentPort)
    parentPort.postMessage(`\x1b[33m[${process.pid}]\x1b[0m: ${stringContent}`); // running as worker
  else
    process.send(
      `\x1b[33m[${process.ppid}:${process.pid}]\x1b[0m: ${stringContent}`
    ); // running as child_process
}

function conclude() {
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
}

function updateSourceDocument(docPath = null, jsonContent = {}) {
  const destinationFilePath = path.resolve(documentsPath, docPath);
  fs.writeFileSync(destinationFilePath, JSON.stringify(jsonContent, null, 4), {
    encoding: "utf-8",
  });
}

// Strips inlined OCR-from-image text added by image-OCR-capable loaders
// (e.g. BookStack's `(Contenido detectado: ...)` appended just before
// the `(Enlace: ...)` URL marker). OCR engines like Tesseract are not
// deterministic — running them twice on the same image can yield
// slightly different text, which would otherwise trigger spurious
// "page changed" updates on every sync. Image insertions/removals
// still get detected because the `[Imagen: ...] (Enlace: ...)`
// scaffolding around the OCR is left intact.
const OCR_DETECTION_PATTERN =
  /\s*\(Contenido detectado:[\s\S]*?\)\s*(?=\(Enlace:)/g;

function contentForDiff(text = "") {
  if (typeof text !== "string") return text;
  return text.replace(OCR_DETECTION_PATTERN, " ");
}

module.exports = {
  log,
  conclude,
  updateSourceDocument,
  contentForDiff,
};
