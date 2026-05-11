const DEFAULT_PER_PAGE = 200;
const DEFAULT_MAX_RESULTS = 5000;
const ARTICLE_BODY_TRUNCATE = 8000;

class ZammadLoader {
  constructor({ baseUrl, apiToken, bypassSSL = false }) {
    if (!baseUrl) throw new Error("Zammad baseUrl is required");
    if (!apiToken) throw new Error("Zammad apiToken is required");
    // Tolerate users pasting either `https://host` or `https://host/api/v1`
    // by stripping a trailing `/api/v1` (and any trailing slashes).
    this.baseUrl = baseUrl
      .replace(/\/+$/, "")
      .replace(/\/api\/v1$/i, "");
    this.apiToken = apiToken;
    this.bypassSSL = !!bypassSSL;
    this.log("Initialized Zammad Loader");
    if (this.bypassSSL)
      this.log("!!SSL bypass is enabled!! Use at your own risk!!");
  }

  log(message, ...args) {
    console.log(`\x1b[36m[Zammad Loader]\x1b[0m ${message}`, ...args);
  }

  get authorizationHeader() {
    return `Token token=${this.apiToken}`;
  }

  async fetchZammadData(url) {
    try {
      if (this.bypassSSL) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      const response = await fetch(url, {
        headers: {
          Authorization: this.authorizationHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to fetch ${url} from Zammad: ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}`
        );
      }
      return await response.json();
    } catch (error) {
      this.log("Error:", error.message);
      throw error;
    } finally {
      if (this.bypassSSL) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    }
  }

  // Zammad's /tickets/search returns either a hydrated array (with `expand=true`)
  // or an object `{ tickets: number[], assets: { Ticket: { id: ticketObj } } }`.
  // Normalize to an array of ticket objects regardless of shape.
  _normalizeSearchPage(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.record_ids) && payload.assets?.Ticket) {
        return payload.record_ids
          .map((id) => payload.assets.Ticket[String(id)])
          .filter(Boolean);
      }
      if (Array.isArray(payload.tickets) && payload.assets?.Ticket) {
        return payload.tickets
          .map((id) => payload.assets.Ticket[String(id)])
          .filter(Boolean);
      }
    }
    return [];
  }

  /**
   * Search for tickets matching a Lucene-style query. Pages through results
   * up to `maxResults`. Logs and stops if the cap is hit.
   * @returns {Promise<Array>} hydrated ticket objects (id, number, title, updated_at, ...)
   */
  async searchTickets({
    query,
    maxResults = DEFAULT_MAX_RESULTS,
    perPage = DEFAULT_PER_PAGE,
  } = {}) {
    if (!query || !String(query).trim())
      throw new Error("Zammad search requires a query");
    const all = [];
    let page = 1;
    while (all.length < maxResults) {
      const url =
        `${this.baseUrl}/api/v1/tickets/search` +
        `?query=${encodeURIComponent(query)}` +
        `&expand=true` +
        `&per_page=${perPage}` +
        `&page=${page}`;
      const payload = await this.fetchZammadData(url);
      const batch = this._normalizeSearchPage(payload);
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
    }
    if (all.length >= maxResults) {
      this.log(
        `Hit safety cap of ${maxResults} tickets — query is too broad. Refine the search query to import the rest.`
      );
      return all.slice(0, maxResults);
    }
    return all;
  }

  async getTicket(ticketId) {
    const url = `${this.baseUrl}/api/v1/tickets/${ticketId}?expand=true`;
    return await this.fetchZammadData(url);
  }

  async getArticles(ticketId) {
    const url = `${this.baseUrl}/api/v1/ticket_articles/by_ticket/${ticketId}?expand=true`;
    const data = await this.fetchZammadData(url);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Strip HTML and decode common entities. Mirrors the Format-ArticleBody helper
   * from the zammad-ticket-info skill so the embedded text reads the same way
   * agents see it in the helpdesk.
   */
  formatArticleBody(raw, contentType = "text/html") {
    if (!raw) return "";
    if (contentType && contentType.startsWith("text/plain")) {
      return raw
        .split("\n")
        .map((l) => l.replace(/\s+$/g, ""))
        .filter((l) => !/^>/.test(l))
        .join("\n")
        .trim();
    }
    let text = String(raw);
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n");
    text = text.replace(/<[^>]+>/g, " ");
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter((line) => line && !/^>/.test(line))
      .join("\n");
  }

  buildTitle(ticket) {
    const num = ticket?.number ?? ticket?.id ?? "?";
    const title = ticket?.title ?? "(sin título)";
    return `[#${num}] ${title}`;
  }

  /**
   * Build the canonical text representation of a ticket (header + thread).
   * Same shape as the `ticket-detail-text` skill output, with attachments noted
   * inline by filename so they are searchable from RAG.
   */
  buildPlainText(ticket, articles, { includeInternal = true } = {}) {
    const lines = [];
    lines.push(this.buildTitle(ticket));

    const stateName = ticket?.state ?? ticket?.state_id ?? "—";
    const groupName = ticket?.group ?? ticket?.group_id ?? "—";
    const ownerParts = [];
    if (ticket?.owner) ownerParts.push(ticket.owner);
    else {
      if (ticket?.owner_id && ticket.owner_id !== 1)
        ownerParts.push(`#${ticket.owner_id}`);
    }
    const ownerName = ownerParts.length ? ownerParts.join(" ") : "—";
    lines.push(
      `estado: ${stateName} · grupo: ${groupName} · owner: ${ownerName}`
    );

    const customerEmail = ticket?.customer ?? ticket?.customer_id ?? "—";
    const orgName = ticket?.organization ?? ticket?.organization_id ?? "—";
    lines.push(`cliente: ${customerEmail} · organización: ${orgName}`);

    if (ticket?.created_at || ticket?.updated_at) {
      lines.push(
        `creado: ${ticket?.created_at ?? "—"} · actualizado: ${ticket?.updated_at ?? "—"}`
      );
    }

    lines.push("");

    const safeArticles = Array.isArray(articles) ? articles : [];
    for (const article of safeArticles) {
      if (!article) continue;
      if (article.sender === "System") continue;
      if (article.internal && !includeInternal) continue;

      const internalTag = article.internal ? " [INTERNAL]" : "";
      const sender = article.sender ?? "—";
      const from = article.from ?? "—";
      const created = article.created_at ?? "";
      lines.push(
        `--- [${article.id}] ${sender}${internalTag} / ${from} / ${created}`
      );

      let body = this.formatArticleBody(article.body, article.content_type);
      if (body.length > ARTICLE_BODY_TRUNCATE)
        body = body.slice(0, ARTICLE_BODY_TRUNCATE) + "…[truncated]";
      if (body) lines.push(body);

      const attachments = Array.isArray(article.attachments)
        ? article.attachments
            .map((a) => a?.filename)
            .filter(Boolean)
        : [];
      if (attachments.length)
        lines.push(`[adjuntos: ${attachments.join(", ")}]`);

      lines.push("");
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
}

module.exports = { ZammadLoader };
