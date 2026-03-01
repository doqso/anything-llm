const { htmlToText } = require("html-to-text");
const { parse } = require("node-html-parser");
const Tesseract = require("tesseract.js");

class BookStackLoader {
    constructor({
        baseUrl,
        tokenId,
        tokenSecret,
        bypassSSL = false,
    }) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.tokenId = tokenId;
        this.tokenSecret = tokenSecret;
        this.bypassSSL = bypassSSL;
        this.log("Initialized BookStack Loader");
        if (this.bypassSSL)
            this.log("!!SSL bypass is enabled!! Use at your own risk!!");
    }

    log(message, ...args) {
        console.log(`\x1b[36m[BookStack Loader]\x1b[0m ${message}`, ...args);
    }

    get authorizationHeader() {
        return `Token ${this.tokenId}:${this.tokenSecret}`;
    }

    async fetchBookStackData(url, isBinary = false) {
        try {
            const initialHeaders = {
                Authorization: this.authorizationHeader,
            };

            if (!isBinary) {
                initialHeaders["Content-Type"] = "application/json";
                initialHeaders["Accept"] = "application/json";
            }

            if (this.bypassSSL) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            const response = await fetch(url, { headers: initialHeaders });
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch ${url} from BookStack: ${response.status}`
                );
            }
            return isBinary ? await response.arrayBuffer() : await response.json();
        } catch (error) {
            this.log("Error:", error);
            throw new Error(error.message);
        } finally {
            if (this.bypassSSL) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
        }
    }

    async fetchAllPages() {
        // BookStack API /api/pages returns a list. 
        // Pagination might be needed if there are many pages.
        // Default limit is 100 usually.
        let allPages = [];
        let count = 100;
        let offset = 0;
        let total = 0;

        do {
            const url = `${this.baseUrl}/api/pages?count=${count}&offset=${offset}`;
            const data = await this.fetchBookStackData(url);
            allPages = allPages.concat(data.data);
            total = data.total;
            offset += count;
        } while (allPages.length < total);

        return allPages;
    }

    async fetchPageContent(pageId) {
        const url = `${this.baseUrl}/api/pages/${pageId}`;
        const pageData = await this.fetchBookStackData(url);
        return pageData;
    }

    async createDocumentFromPage(pageData) {
        const root = parse(pageData.html);
        const images = root.querySelectorAll("img");
        const imageDescriptions = [];

        for (const img of images) {
            const src = img.getAttribute("src");
            const alt = img.getAttribute("alt") || "";
            if (!src) continue;

            // Normalize URL
            const absoluteSrc = src.startsWith("http")
                ? src
                : `${this.baseUrl}${src.startsWith("/") ? "" : "/"}${src}`;

            let description = alt ? `[Imagen: ${alt}]` : "[Imagen sin descripción]";

            // Try OCR if the image is from BookStack and we have tokens
            try {
                this.log(`Attempting OCR on image: ${absoluteSrc}`);
                const imageBuffer = await this.fetchBookStackData(absoluteSrc, true);
                const { data: { text } } = await Tesseract.recognize(Buffer.from(imageBuffer), 'eng+spa');
                if (text?.trim()) {
                    description += ` (Contenido detectado: ${text.trim().replace(/\n/g, " ")})`;
                }
            } catch (ocrError) {
                this.log(`OCR failed for ${absoluteSrc}:`, ocrError.message);
            }

            // Replace image tag with a placeholder in the HTML so html-to-text preserves it
            img.replaceWith(`\n${description} (Enlace: ${absoluteSrc})\n`);
        }

        const processedHtml = root.innerHTML;
        const plainTextContent = htmlToText(processedHtml, {
            wordwrap: false,
            preserveNewlines: true,
            selectors: [
                { selector: 'img', format: 'skip' } // We already handled images
            ]
        });

        const pageUrl = `${this.baseUrl}/books/${pageData.book_id}/page/${pageData.slug}`;

        return {
            pageContent: plainTextContent,
            metadata: {
                id: pageData.id,
                title: pageData.name,
                url: pageUrl,
                updated_at: pageData.updated_at,
                created_at: pageData.created_at,
                book_id: pageData.book_id,
            },
        };
    }
}

module.exports = { BookStackLoader };
