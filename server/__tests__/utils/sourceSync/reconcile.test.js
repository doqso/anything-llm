jest.mock("../../../models/documents", () => ({
  Document: {
    where: jest.fn(),
    get: jest.fn(),
    addDocuments: jest.fn(),
    removeDocuments: jest.fn(),
  },
}));

jest.mock("../../../models/documentSyncQueue", () => ({
  DocumentSyncQueue: {
    watch: jest.fn(),
    unwatch: jest.fn(),
  },
}));

jest.mock("../../../models/workspace", () => ({
  Workspace: { get: jest.fn() },
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(false),
    unlinkSync: jest.fn(),
  };
});

const { Document } = require("../../../models/documents");
const { DocumentSyncQueue } = require("../../../models/documentSyncQueue");
const { reconcileSource } = require("../../../utils/sourceSync");

function chunkSourceFor(pageId) {
  return `bookstack://${pageId}?payload=ciphertext:iv`;
}

function mockDoc({ id, pageId, docpath }) {
  return {
    id,
    workspaceId: 1,
    docpath,
    metadata: JSON.stringify({ chunkSource: chunkSourceFor(pageId) }),
  };
}

const workspace = { id: 1, name: "WS", slug: "ws" };

const fakeDriver = {
  type: "bookstack",
  enumerate: jest.fn(),
  fetchPage: jest.fn(),
  localDocFilter: () => ({ docpath: { startsWith: "bookstack-x/" } }),
  pageIdFromDocument: (doc) => {
    const m = JSON.parse(doc.metadata).chunkSource.match(
      /^bookstack:\/\/([^?]+)/
    );
    return m ? m[1] : null;
  },
};

const sourceRecord = {
  id: 42,
  type: "bookstack",
  workspaceId: 1,
  workspace,
};

beforeEach(() => {
  jest.clearAllMocks();
  Document.addDocuments.mockImplementation(async (_ws, paths) => ({
    embedded: paths,
    failedToEmbed: [],
    errors: [],
  }));
  Document.removeDocuments.mockResolvedValue(true);
  Document.get.mockImplementation(async ({ docpath }) => ({
    id: 99,
    docpath,
    workspaceId: 1,
    filename: docpath.split("/").pop(),
  }));
});

describe("reconcileSource", () => {
  it("adds pages that are remote-only and marks them watched", async () => {
    Document.where.mockResolvedValue([]);
    fakeDriver.enumerate.mockResolvedValue([
      { pageId: "10" },
      { pageId: "11" },
    ]);
    fakeDriver.fetchPage.mockImplementation(async (_c, pid) =>
      `bookstack-x/page-${pid}.json`
    );

    const result = await reconcileSource(sourceRecord, {
      driver: fakeDriver,
      cfg: { baseUrl: "https://x.test", tokenId: "a", tokenSecret: "b" },
    });

    expect(result.added).toBe(2);
    expect(result.removed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(Document.addDocuments).toHaveBeenCalledTimes(2);
    expect(DocumentSyncQueue.watch).toHaveBeenCalledTimes(2);
  });

  it("removes pages that no longer exist at source", async () => {
    Document.where.mockResolvedValue([
      mockDoc({ id: 1, pageId: "10", docpath: "bookstack-x/p10.json" }),
      mockDoc({ id: 2, pageId: "11", docpath: "bookstack-x/p11.json" }),
    ]);
    fakeDriver.enumerate.mockResolvedValue([{ pageId: "10" }]);

    const result = await reconcileSource(sourceRecord, {
      driver: fakeDriver,
      cfg: { baseUrl: "https://x.test", tokenId: "a", tokenSecret: "b" },
    });

    expect(result.added).toBe(0);
    expect(result.removed).toBe(1);
    expect(Document.removeDocuments).toHaveBeenCalledWith(
      workspace,
      ["bookstack-x/p11.json"],
      null
    );
    expect(DocumentSyncQueue.unwatch).toHaveBeenCalledTimes(1);
  });

  it("handles a mix of additions and removals", async () => {
    Document.where.mockResolvedValue([
      mockDoc({ id: 1, pageId: "10", docpath: "bookstack-x/p10.json" }),
    ]);
    fakeDriver.enumerate.mockResolvedValue([
      { pageId: "11" },
      { pageId: "12" },
    ]);
    fakeDriver.fetchPage.mockImplementation(async (_c, pid) =>
      `bookstack-x/page-${pid}.json`
    );

    const result = await reconcileSource(sourceRecord, {
      driver: fakeDriver,
      cfg: { baseUrl: "https://x.test", tokenId: "a", tokenSecret: "b" },
    });

    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
  });

  it("is a no-op when everything is already in sync", async () => {
    Document.where.mockResolvedValue([
      mockDoc({ id: 1, pageId: "10", docpath: "bookstack-x/p10.json" }),
    ]);
    fakeDriver.enumerate.mockResolvedValue([{ pageId: "10" }]);

    const result = await reconcileSource(sourceRecord, {
      driver: fakeDriver,
      cfg: { baseUrl: "https://x.test", tokenId: "a", tokenSecret: "b" },
    });

    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(Document.addDocuments).not.toHaveBeenCalled();
    expect(Document.removeDocuments).not.toHaveBeenCalled();
  });

  it("reports errors per-item without aborting the whole run", async () => {
    Document.where.mockResolvedValue([]);
    fakeDriver.enumerate.mockResolvedValue([
      { pageId: "10" },
      { pageId: "11" },
    ]);
    fakeDriver.fetchPage
      .mockImplementationOnce(async () => {
        throw new Error("collector down");
      })
      .mockImplementationOnce(
        async (_c, pid) => `bookstack-x/page-${pid}.json`
      );

    const result = await reconcileSource(sourceRecord, {
      driver: fakeDriver,
      cfg: { baseUrl: "https://x.test", tokenId: "a", tokenSecret: "b" },
    });

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/collector down/);
  });
});
