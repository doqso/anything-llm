const crypto = require("crypto");

// Stable keys so EncryptionManager can round-trip in tests without touching ENV/fs.
process.env.SIG_KEY = crypto.randomBytes(32).toString("hex");
process.env.SIG_SALT = crypto.randomBytes(32).toString("hex");

jest.mock("../../utils/helpers/updateENV", () => ({
  dumpENV: jest.fn(),
}));

const { SourceSyncConfig } = require("../../models/sourceSyncConfig");

describe("SourceSyncConfig", () => {
  describe("encryptConfig / decryptConfig", () => {
    it("round-trips an arbitrary config object", () => {
      const cfg = {
        baseUrl: "https://bookstack.example.com",
        tokenId: "abc",
        tokenSecret: "shhh",
        bypassSSL: true,
      };
      const encrypted = SourceSyncConfig.encryptConfig(cfg);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toContain("shhh");

      const decrypted = SourceSyncConfig.decryptConfig({
        encryptedConfig: encrypted,
      });
      expect(decrypted).toEqual(cfg);
    });

    it("returns null when decrypting garbage", () => {
      expect(
        SourceSyncConfig.decryptConfig({ encryptedConfig: "not-ciphertext" })
      ).toBeNull();
    });

    it("returns null when record lacks encryptedConfig", () => {
      expect(SourceSyncConfig.decryptConfig({})).toBeNull();
      expect(SourceSyncConfig.decryptConfig(null)).toBeNull();
    });
  });

  describe("calcNextSync", () => {
    it("adds intervalMs to now", () => {
      const before = Date.now();
      const next = SourceSyncConfig.calcNextSync({ intervalMs: 10 * 60 * 1000 });
      const delta = next.getTime() - before;
      expect(delta).toBeGreaterThanOrEqual(10 * 60 * 1000);
      expect(delta).toBeLessThan(10 * 60 * 1000 + 2000);
    });

    it("clamps below-minimum intervals up to minIntervalMs", () => {
      const next = SourceSyncConfig.calcNextSync({ intervalMs: 1 });
      const delta = next.getTime() - Date.now();
      expect(delta).toBeGreaterThanOrEqual(SourceSyncConfig.minIntervalMs - 100);
    });

    it("falls back to defaultIntervalMs when missing", () => {
      const next = SourceSyncConfig.calcNextSync({});
      const delta = next.getTime() - Date.now();
      expect(delta).toBeGreaterThanOrEqual(
        SourceSyncConfig.defaultIntervalMs - 100
      );
    });
  });

  describe("validTypes", () => {
    it("contains bookstack", () => {
      expect(SourceSyncConfig.validTypes).toContain("bookstack");
    });
  });
});
