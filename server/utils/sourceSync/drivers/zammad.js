const { default: slugify } = require("slugify");
const { CollectorApi } = require("../../collectorApi");
const { safeJsonParse } = require("../../http");

function folderSlug(baseUrl) {
  const { hostname } = new URL(baseUrl);
  return slugify(`zammad-${hostname}`).toLowerCase();
}

const zammadDriver = {
  type: "zammad",

  async enumerate(cfg) {
    const collector = new CollectorApi();
    const resp = await collector.forwardExtensionRequest({
      endpoint: "/ext/zammad-enumerate",
      method: "POST",
      body: JSON.stringify(cfg),
    });
    if (!resp?.success)
      throw new Error(resp?.reason || "Zammad enumerate failed.");
    return (resp.pages || []).map((p) => ({
      pageId: String(p.pageId),
      updatedAt: p.updated_at,
      name: p.name,
    }));
  },

  async fetchPage(cfg, pageId) {
    const collector = new CollectorApi();
    const resp = await collector.forwardExtensionRequest({
      endpoint: "/ext/zammad-fetch-page",
      method: "POST",
      body: JSON.stringify({ ...cfg, ticketId: pageId }),
    });
    if (!resp?.success || !resp.docpath)
      throw new Error(
        resp?.reason || `Zammad fetch-page failed for ticket ${pageId}.`
      );
    return resp.docpath;
  },

  localDocFilter(cfg) {
    return { docpath: { startsWith: `${folderSlug(cfg.baseUrl)}/` } };
  },

  pageIdFromDocument(document) {
    const metadata = safeJsonParse(document?.metadata, null);
    const chunkSource = metadata?.chunkSource;
    if (!chunkSource || !chunkSource.startsWith("zammad://")) return null;
    const m = chunkSource.match(/^zammad:\/\/([^?]+)/);
    return m ? String(m[1]) : null;
  },
};

module.exports = { zammadDriver };
