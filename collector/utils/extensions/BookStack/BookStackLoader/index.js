const { htmlToText } = require("html-to-text");

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

    async fetchBookStackData(url) {
        try {
            const initialHeaders = {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: this.authorizationHeader,
            };

            if (this.bypassSSL) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            const response = await fetch(url, { headers: initialHeaders });
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch ${url} from BookStack: ${response.status}`
                );
            }
            return await response.json();
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

    createDocumentFromPage(pageData) {
        const plainTextContent = htmlToText(pageData.html, {
            wordwrap: false,
            preserveNewlines: true,
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
