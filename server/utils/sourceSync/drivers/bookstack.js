const { default: slugify } = require("slugify");
const { CollectorApi } = require("../../collectorApi");
const { safeJsonParse } = require("../../http");

function folderSlug(baseUrl) {
  const { hostname } = new URL(baseUrl);
  return slugify(`bookstack-${hostname}`).toLowerCase();
}

const bookstackDriver = {
  type: "bookstack",

  async enumerate(cfg) {
    const collector = new CollectorApi();
    const resp = await collector.forwardExtensionRequest({
      endpoint: "/ext/bookstack-enumerate",
      method: "POST",
      body: JSON.stringify(cfg),
    });
    if (!resp?.success)
      throw new Error(resp?.reason || "BookStack enumerate failed.");
    return (resp.pages || []).map((p) => ({
      pageId: String(p.pageId),
      updatedAt: p.updated_at,
      name: p.name,
    }));
  },

  async fetchPage(cfg, pageId) {
    const collector = new CollectorApi();
    const resp = await collector.forwardExtensionRequest({
      endpoint: "/ext/bookstack-fetch-page",
      method: "POST",
      body: JSON.stringify({ ...cfg, pageId }),
    });
    if (!resp?.success || !resp.docpath)
      throw new Error(
        resp?.reason || `BookStack fetch-page failed for ${pageId}.`
      );
    return resp.docpath;
  },

  localDocFilter(cfg) {
    return { docpath: { startsWith: `${folderSlug(cfg.baseUrl)}/` } };
  },

  pageIdFromDocument(document) {
    const metadata = safeJsonParse(document?.metadata, null);
    const chunkSource = metadata?.chunkSource;
    if (!chunkSource || !chunkSource.startsWith("bookstack://")) return null;
    const m = chunkSource.match(/^bookstack:\/\/([^?]+)/);
    return m ? String(m[1]) : null;
  },
};

module.exports = { bookstackDriver };
