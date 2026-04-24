const fs = require("fs");
const path = require("path");
const { default: slugify } = require("slugify");
const { writeToServerDocuments, sanitizeFileName } = require("../../files");
const { tokenizeString } = require("../../tokenizer");
const { BookStackLoader } = require("./BookStackLoader");

function validBaseUrl(baseUrl) {
    try {
        new URL(baseUrl);
        return true;
    } catch (e) {
        return false;
    }
}

function generateChunkSource(
    { pageId, baseUrl, tokenId, tokenSecret, bypassSSL },
    encryptionWorker
) {
    const payload = {
        baseUrl,
        tokenId,
        tokenSecret,
        bypassSSL,
    };
    return `bookstack://${pageId}?payload=${encryptionWorker.encrypt(
        JSON.stringify(payload)
    )}`;
}

function resolveOutFolder(hostname) {
    const outFolder = slugify(`bookstack-${hostname}`).toLowerCase();
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
 * Build the document data object + write the JSON file for a single BookStack page.
 * Shared by `loadBookStack` (bulk import) and `fetchAndSaveBookStackPage` (per-page reconcile).
 * @returns {{ docpath: string, fileName: string, data: object }}
 */
function writeDocumentFileFor({
    loader,
    pageData,
    doc,
    origin,
    hostname,
    tokenId,
    tokenSecret,
    bypassSSL,
    encryptionWorker,
    outFolder,
    outFolderPath,
}) {
    const data = {
        id: `bookstack-${hostname}-${doc.metadata.id}`,
        url: doc.metadata.url,
        title: doc.metadata.title,
        docAuthor: origin,
        description: doc.metadata.title,
        docSource: `${origin} BookStack`,
        chunkSource: generateChunkSource(
            {
                pageId: doc.metadata.id,
                baseUrl: origin,
                tokenId,
                tokenSecret,
                bypassSSL,
            },
            encryptionWorker
        ),
        published: new Date().toLocaleString(),
        wordCount: doc.pageContent.split(" ").length,
        pageContent: doc.pageContent,
        token_count_estimate: tokenizeString(doc.pageContent),
    };

    // writeToServerDocuments appends `.json` itself — pass the bare slug-id without an extension.
    const fileName = sanitizeFileName(
        `${slugify(doc.metadata.title)}-${doc.metadata.id}`
    );
    const written = writeToServerDocuments({
        data,
        filename: fileName,
        destinationOverride: outFolderPath,
    });
    // `written.location` is `<outFolder>/<file>.json` and matches the real path on disk.
    const docpath = written.location;

    console.log(`[BookStack Loader]: Saved ${doc.metadata.title} to ${docpath}`);
    return { docpath, fileName: docpath.split("/").pop(), data };
}

/**
 * Load BookStack documents from a BookStack instance
 * @param {object} args - forwarded request body params
 * @param {import("../../../middleware/setDataSigner").ResponseWithSigner} response - Express response object with encryptionWorker
 * @returns
 */
async function loadBookStack(
    {
        baseUrl = null,
        tokenId = null,
        tokenSecret = null,
        bypassSSL = false,
    },
    response
) {
    if (!tokenId || !tokenSecret) {
        return {
            success: false,
            reason: "You need both a Token ID and Token Secret to use the BookStack connector.",
        };
    }

    if (!baseUrl || !validBaseUrl(baseUrl)) {
        return {
            success: false,
            reason: "Provided base URL is not a valid URL.",
        };
    }

    const { origin, hostname } = new URL(baseUrl);
    console.log(`-- Working BookStack ${origin} --`);
    const loader = new BookStackLoader({
        baseUrl: origin,
        tokenId,
        tokenSecret,
        bypassSSL,
    });

    try {
        const pages = await loader.fetchAllPages();
        if (!pages.length) {
            return {
                success: false,
                reason: "No pages found for that BookStack instance.",
            };
        }

        const { outFolder, outFolderPath } = resolveOutFolder(hostname);

        for (const page of pages) {
            const pageData = await loader.fetchPageContent(page.id);
            if (!pageData || !pageData.html) continue;
            const doc = await loader.createDocumentFromPage(pageData);
            writeDocumentFileFor({
                loader,
                pageData,
                doc,
                origin,
                hostname,
                tokenId,
                tokenSecret,
                bypassSSL,
                encryptionWorker: response.locals.encryptionWorker,
                outFolder,
                outFolderPath,
            });
        }

        return {
            success: true,
            reason: null,
            data: {
                destination: outFolder,
            },
        };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            reason: error.message,
        };
    }
}

/**
 * Fetches the current content of a BookStack page without persisting. Used by resync.
 */
async function fetchBookStackPage({
    pageId,
    baseUrl,
    tokenId,
    tokenSecret,
    bypassSSL = false,
}) {
    if (!pageId || !baseUrl || !tokenId || !tokenSecret) {
        return {
            success: false,
            content: null,
            reason: "Missing required parameters for BookStack resync.",
        };
    }

    console.log(`-- Working BookStack Page ${pageId} --`);
    const loader = new BookStackLoader({
        baseUrl,
        tokenId,
        tokenSecret,
        bypassSSL,
    });

    try {
        const pageData = await loader.fetchPageContent(pageId);
        if (!pageData || !pageData.html) {
            return {
                success: false,
                reason: "Page content could not be retrieved from BookStack.",
                content: null,
            };
        }

        const doc = await loader.createDocumentFromPage(pageData);
        return {
            success: true,
            reason: null,
            content: doc.pageContent,
        };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            reason: error.message,
            content: null,
        };
    }
}

/**
 * Enumerate the list of pages currently at a BookStack instance.
 * Returns lightweight metadata — no HTML/OCR work.
 */
async function enumerateBookStackPages({
    baseUrl,
    tokenId,
    tokenSecret,
    bypassSSL = false,
}) {
    if (!baseUrl || !tokenId || !tokenSecret) {
        return {
            success: false,
            reason: "Missing required parameters for BookStack enumerate.",
            pages: [],
        };
    }
    if (!validBaseUrl(baseUrl)) {
        return {
            success: false,
            reason: "Provided base URL is not a valid URL.",
            pages: [],
        };
    }

    const { origin } = new URL(baseUrl);
    const loader = new BookStackLoader({
        baseUrl: origin,
        tokenId,
        tokenSecret,
        bypassSSL,
    });
    try {
        const pages = await loader.fetchAllPages();
        return {
            success: true,
            reason: null,
            pages: pages.map((p) => ({
                pageId: p.id,
                updated_at: p.updated_at,
                name: p.name,
                book_id: p.book_id,
            })),
        };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            reason: error.message,
            pages: [],
        };
    }
}

/**
 * Fetch a single BookStack page, parse it into the same document shape
 * `loadBookStack` uses, and write the JSON file on disk.
 * Returns the docpath relative to the `storage/documents` root.
 */
async function fetchAndSaveBookStackPage(
    {
        pageId = null,
        baseUrl = null,
        tokenId = null,
        tokenSecret = null,
        bypassSSL = false,
    },
    response
) {
    if (!pageId || !baseUrl || !tokenId || !tokenSecret) {
        return {
            success: false,
            reason: "Missing required parameters for BookStack fetch-page.",
            docpath: null,
        };
    }
    if (!validBaseUrl(baseUrl)) {
        return {
            success: false,
            reason: "Provided base URL is not a valid URL.",
            docpath: null,
        };
    }

    const { origin, hostname } = new URL(baseUrl);
    const loader = new BookStackLoader({
        baseUrl: origin,
        tokenId,
        tokenSecret,
        bypassSSL,
    });

    try {
        const pageData = await loader.fetchPageContent(pageId);
        if (!pageData || !pageData.html) {
            return {
                success: false,
                reason: "Page content could not be retrieved from BookStack.",
                docpath: null,
            };
        }
        const doc = await loader.createDocumentFromPage(pageData);
        const { outFolder, outFolderPath } = resolveOutFolder(hostname);
        const { docpath } = writeDocumentFileFor({
            loader,
            pageData,
            doc,
            origin,
            hostname,
            tokenId,
            tokenSecret,
            bypassSSL,
            encryptionWorker: response.locals.encryptionWorker,
            outFolder,
            outFolderPath,
        });
        return { success: true, reason: null, docpath };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            reason: error.message,
            docpath: null,
        };
    }
}

module.exports = {
    loadBookStack,
    fetchBookStackPage,
    enumerateBookStackPages,
    fetchAndSaveBookStackPage,
};
