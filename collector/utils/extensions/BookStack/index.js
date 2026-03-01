const fs = require("fs");
const path = require("path");
const { default: slugify } = require("slugify");
const { v4 } = require("uuid");
const { writeToServerDocuments, sanitizeFileName } = require("../../files");
const { tokenizeString } = require("../../tokenizer");
const { BookStackLoader } = require("./BookStackLoader");

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

        const outFolder = slugify(
            `bookstack-${hostname}-${v4().slice(0, 4)}`
        ).toLowerCase();

        const outFolderPath =
            process.env.NODE_ENV === "development"
                ? path.resolve(
                    __dirname,
                    `../../../../server/storage/documents/${outFolder}`
                )
                : path.resolve(process.env.STORAGE_DIR, `documents/${outFolder}`);

        if (!fs.existsSync(outFolderPath))
            fs.mkdirSync(outFolderPath, { recursive: true });

        for (const page of pages) {
            const pageData = await loader.fetchPageContent(page.id);
            if (!pageData || !pageData.html) continue;

            const doc = loader.createDocumentFromPage(pageData);
            const data = {
                id: v4(),
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
                    response.locals.encryptionWorker
                ),
                published: new Date().toLocaleString(),
                wordCount: doc.pageContent.split(" ").length,
                pageContent: doc.pageContent,
                token_count_estimate: tokenizeString(doc.pageContent),
            };

            console.log(
                `[BookStack Loader]: Saving ${doc.metadata.title} to ${outFolder}`
            );

            const fileName = sanitizeFileName(
                `${slugify(doc.metadata.title)}-${data.id}`
            );
            writeToServerDocuments({
                data,
                filename: fileName,
                destinationOverride: outFolderPath,
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
 * Gets the page content from a specific BookStack page.
 * @returns
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

        const doc = loader.createDocumentFromPage(pageData);
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

module.exports = {
    loadBookStack,
    fetchBookStackPage,
};
