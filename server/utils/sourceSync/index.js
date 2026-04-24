const fs = require("fs");
const path = require("path");
const { bookstackDriver } = require("./drivers/bookstack");

const DRIVERS = {
  bookstack: bookstackDriver,
};

function getDriver(type) {
  const driver = DRIVERS[type];
  if (!driver) throw new Error(`Unsupported source type: ${type}`);
  return driver;
}

function documentsPath() {
  return process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, "../../storage/documents")
    : path.resolve(process.env.STORAGE_DIR, "documents");
}

/**
 * Reconcile a single source_sync_configs row with its remote content.
 * Adds new pages (downloads + embeds + marks as watched) and removes
 * pages that no longer exist at the source.
 *
 * @param {object} sourceRecord - a row from source_sync_configs, may include `workspace`
 * @returns {{added: number, removed: number, addedDetails: Array, removedDetails: Array, errors: string[]}}
 */
async function reconcileSource(sourceRecord, opts = {}) {
  const { SourceSyncConfig } = require("../../models/sourceSyncConfig");
  const { Document } = require("../../models/documents");
  const { DocumentSyncQueue } = require("../../models/documentSyncQueue");
  const { Workspace } = require("../../models/workspace");

  const driver = opts.driver || getDriver(sourceRecord.type);
  const cfg =
    opts.cfg !== undefined
      ? opts.cfg
      : SourceSyncConfig.decryptConfig(sourceRecord);
  if (!cfg)
    throw new Error("Failed to decrypt config for source " + sourceRecord.id);

  const workspace =
    sourceRecord.workspace ||
    (await Workspace.get({ id: sourceRecord.workspaceId }));
  if (!workspace)
    throw new Error(`Workspace ${sourceRecord.workspaceId} not found.`);

  const remote = await driver.enumerate(cfg);
  const remotePageIds = new Set(remote.map((r) => String(r.pageId)));

  const localDocs = await Document.where({
    workspaceId: workspace.id,
    ...driver.localDocFilter(cfg),
  });
  const localByPageId = new Map();
  for (const d of localDocs) {
    const pid = driver.pageIdFromDocument(d);
    if (pid) localByPageId.set(String(pid), d);
  }

  const toAdd = remote.filter((r) => !localByPageId.has(String(r.pageId)));
  const toRemove = [];
  for (const [pid, doc] of localByPageId.entries()) {
    if (!remotePageIds.has(pid)) toRemove.push(doc);
  }

  const addedDetails = [];
  const removedDetails = [];
  const errors = [];

  for (const item of toAdd) {
    try {
      const docpath = await driver.fetchPage(cfg, item.pageId);
      const { embedded, failedToEmbed, errors: addErrors } =
        await Document.addDocuments(workspace, [docpath], null);
      if (!embedded.includes(docpath)) {
        errors.push(
          `Failed to embed new page ${item.pageId}: ${addErrors?.join(", ") || failedToEmbed?.join(", ") || "unknown"}`
        );
        continue;
      }
      const workspaceDoc = await Document.get({
        workspaceId: workspace.id,
        docpath,
      });
      if (workspaceDoc) await DocumentSyncQueue.watch(workspaceDoc);
      addedDetails.push({ pageId: String(item.pageId), docpath });
    } catch (e) {
      errors.push(`Add ${item.pageId} failed: ${e.message}`);
    }
  }

  for (const doc of toRemove) {
    try {
      await DocumentSyncQueue.unwatch(doc);
      await Document.removeDocuments(workspace, [doc.docpath], null);
      const absPath = path.resolve(documentsPath(), doc.docpath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      removedDetails.push({
        pageId: driver.pageIdFromDocument(doc),
        docpath: doc.docpath,
      });
    } catch (e) {
      errors.push(`Remove ${doc.docpath} failed: ${e.message}`);
    }
  }

  return {
    added: addedDetails.length,
    removed: removedDetails.length,
    addedDetails,
    removedDetails,
    errors,
  };
}

module.exports = { getDriver, reconcileSource };
