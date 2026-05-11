const fs = require("fs");
const path = require("path");
const { default: slugify } = require("slugify");
const { writeToServerDocuments, sanitizeFileName } = require("../../files");
const { tokenizeString } = require("../../tokenizer");
const { ZammadLoader } = require("./ZammadLoader");

function validBaseUrl(baseUrl) {
  try {
    new URL(baseUrl);
    return true;
  } catch (e) {
    return false;
  }
}

function generateChunkSource(
  { ticketId, baseUrl, apiToken, bypassSSL, includeInternal },
  encryptionWorker
) {
  const payload = {
    baseUrl,
    apiToken,
    bypassSSL: !!bypassSSL,
    includeInternal: includeInternal !== false,
  };
  return `zammad://${ticketId}?payload=${encryptionWorker.encrypt(
    JSON.stringify(payload)
  )}`;
}

function resolveOutFolder(hostname) {
  const outFolder = slugify(`zammad-${hostname}`).toLowerCase();
  const outFolderPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(
          __dirname,
          `../../../../server/storage/documents/${outFolder}`
        )
      : path.resolve(process.env.STORAGE_DIR, `documents/${outFolder}`);
  if (!fs.existsSync(outFolderPath))
    fs.mkdirSync(outFolderPath, { recursive: true });
  return { outFolder, outFolderPath };
}

/**
 * Build the document data object + write the JSON file for a single Zammad ticket.
 * Shared by `loadZammad` (bulk import) and `fetchAndSaveZammadTicket` (per-ticket reconcile).
 */
function writeDocumentFileFor({
  loader,
  ticket,
  articles,
  origin,
  hostname,
  apiToken,
  bypassSSL,
  includeInternal,
  encryptionWorker,
  outFolderPath,
}) {
  const ticketTitle = loader.buildTitle(ticket);
  const pageContent = loader.buildPlainText(ticket, articles, {
    includeInternal,
  });
  const ticketUrl = `${origin}/#ticket/zoom/${ticket.id}`;

  const data = {
    id: `zammad-${hostname}-${ticket.id}`,
    url: ticketUrl,
    title: ticketTitle,
    docAuthor: origin,
    description: ticketTitle,
    docSource: `${origin} Zammad`,
    chunkSource: generateChunkSource(
      {
        ticketId: ticket.id,
        baseUrl: origin,
        apiToken,
        bypassSSL,
        includeInternal,
      },
      encryptionWorker
    ),
    published: new Date().toLocaleString(),
    wordCount: pageContent.split(/\s+/).filter(Boolean).length,
    pageContent,
    token_count_estimate: tokenizeString(pageContent),
  };

  const fileName = sanitizeFileName(
    `${slugify(ticketTitle, { lower: true })}-${ticket.id}`
  );
  const written = writeToServerDocuments({
    data,
    filename: fileName,
    destinationOverride: outFolderPath,
  });
  const docpath = written.location;
  console.log(`[Zammad Loader]: Saved ticket ${ticket.id} to ${docpath}`);
  return { docpath, data };
}

/**
 * Bulk import: enumerate tickets matching `query` and persist each as JSON.
 */
async function loadZammad(
  {
    baseUrl = null,
    apiToken = null,
    query = null,
    bypassSSL = false,
    includeInternal = true,
  },
  response
) {
  if (!apiToken)
    return {
      success: false,
      reason: "An API token is required to use the Zammad connector.",
    };
  if (!baseUrl || !validBaseUrl(baseUrl))
    return { success: false, reason: "Provided base URL is not a valid URL." };
  if (!query || !String(query).trim())
    return {
      success: false,
      reason:
        "A Zammad search query is required (e.g. `state.name:\"open\" AND group.name:\"Soporte\"`).",
    };

  const { origin, hostname } = new URL(baseUrl);
  console.log(`-- Working Zammad ${origin} --`);
  const loader = new ZammadLoader({ baseUrl: origin, apiToken, bypassSSL });

  try {
    const tickets = await loader.searchTickets({ query });
    if (!tickets.length)
      return {
        success: false,
        reason: "No tickets matched the provided query.",
      };

    const { outFolder, outFolderPath } = resolveOutFolder(hostname);

    for (const ticketSummary of tickets) {
      const ticketId = ticketSummary?.id;
      if (!ticketId) continue;
      const ticket = await loader.getTicket(ticketId);
      const articles = await loader.getArticles(ticketId);
      writeDocumentFileFor({
        loader,
        ticket,
        articles,
        origin,
        hostname,
        apiToken,
        bypassSSL,
        includeInternal,
        encryptionWorker: response.locals.encryptionWorker,
        outFolderPath,
      });
    }

    return {
      success: true,
      reason: null,
      data: { destination: outFolder },
    };
  } catch (error) {
    console.error(error);
    return { success: false, reason: error.message };
  }
}

/**
 * Lightweight enumeration used by the Source Sync reconciler — returns the
 * list of tickets currently matching the query so it can diff against the
 * already-imported set.
 */
async function enumerateZammadTickets({
  baseUrl,
  apiToken,
  query,
  bypassSSL = false,
}) {
  if (!apiToken || !baseUrl || !query)
    return {
      success: false,
      reason: "Missing required parameters for Zammad enumerate.",
      pages: [],
    };
  if (!validBaseUrl(baseUrl))
    return {
      success: false,
      reason: "Provided base URL is not a valid URL.",
      pages: [],
    };

  const { origin } = new URL(baseUrl);
  const loader = new ZammadLoader({ baseUrl: origin, apiToken, bypassSSL });
  try {
    const tickets = await loader.searchTickets({ query });
    return {
      success: true,
      reason: null,
      pages: tickets.map((t) => ({
        pageId: t.id,
        updated_at: t.updated_at,
        name: loader.buildTitle(t),
      })),
    };
  } catch (error) {
    console.error(error);
    return { success: false, reason: error.message, pages: [] };
  }
}

/**
 * Fetch a single ticket + its articles, persist to disk and return the docpath.
 * Used by the Source Sync reconciler when adding new tickets.
 */
async function fetchAndSaveZammadTicket(
  {
    ticketId = null,
    baseUrl = null,
    apiToken = null,
    bypassSSL = false,
    includeInternal = true,
  },
  response
) {
  if (!ticketId || !baseUrl || !apiToken)
    return {
      success: false,
      reason: "Missing required parameters for Zammad fetch-page.",
      docpath: null,
    };
  if (!validBaseUrl(baseUrl))
    return {
      success: false,
      reason: "Provided base URL is not a valid URL.",
      docpath: null,
    };

  const { origin, hostname } = new URL(baseUrl);
  const loader = new ZammadLoader({ baseUrl: origin, apiToken, bypassSSL });

  try {
    const ticket = await loader.getTicket(ticketId);
    if (!ticket || !ticket.id)
      return {
        success: false,
        reason: "Ticket could not be retrieved from Zammad.",
        docpath: null,
      };
    const articles = await loader.getArticles(ticketId);
    const { outFolderPath } = resolveOutFolder(hostname);
    const { docpath } = writeDocumentFileFor({
      loader,
      ticket,
      articles,
      origin,
      hostname,
      apiToken,
      bypassSSL,
      includeInternal,
      encryptionWorker: response.locals.encryptionWorker,
      outFolderPath,
    });
    return { success: true, reason: null, docpath };
  } catch (error) {
    console.error(error);
    return { success: false, reason: error.message, docpath: null };
  }
}

/**
 * Re-fetch a ticket's content for the live document watcher. Returns the rebuilt
 * plain-text body without writing anything to disk — `sync-watched-documents`
 * compares this against the cached copy and only re-embeds on diff.
 */
async function fetchZammadTicket({
  ticketId,
  baseUrl,
  apiToken,
  bypassSSL = false,
  includeInternal = true,
}) {
  if (!ticketId || !baseUrl || !apiToken)
    return {
      success: false,
      reason: "Missing required parameters for Zammad resync.",
      content: null,
    };
  const loader = new ZammadLoader({ baseUrl, apiToken, bypassSSL });
  try {
    const ticket = await loader.getTicket(ticketId);
    if (!ticket || !ticket.id)
      return {
        success: false,
        reason: "Ticket could not be retrieved from Zammad.",
        content: null,
      };
    const articles = await loader.getArticles(ticketId);
    const content = loader.buildPlainText(ticket, articles, {
      includeInternal,
    });
    return { success: true, reason: null, content };
  } catch (error) {
    console.error(error);
    return { success: false, reason: error.message, content: null };
  }
}

module.exports = {
  loadZammad,
  enumerateZammadTickets,
  fetchAndSaveZammadTicket,
  fetchZammadTicket,
};
