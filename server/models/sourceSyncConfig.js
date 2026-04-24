const prisma = require("../utils/prisma");
const { SystemSettings } = require("./systemSettings");
const { Telemetry } = require("./telemetry");

const SourceSyncConfig = {
  featureKey: "experimental_source_sync",
  validTypes: ["bookstack"],
  defaultIntervalMs: 3600000, // 1 hour
  minIntervalMs: 60000, // 1 minute lower bound
  maxRepeatFailures: 5, // after N straight failures, back off to failureBackoffMs
  failureBackoffMs: 86400000, // 24 hours
  writable: ["intervalMs", "encryptedConfig"],

  bootWorkers: function () {
    const {
      BackgroundService,
    } = require("../utils/BackgroundWorkers");
    new BackgroundService().boot();
  },

  killWorkers: function () {
    const {
      BackgroundService,
    } = require("../utils/BackgroundWorkers");
    new BackgroundService().stop();
  },

  enabled: async function () {
    return (
      (await SystemSettings.get({ label: this.featureKey }))?.value ===
      "enabled"
    );
  },

  _encryptionManager: null,
  encryptionManager: function () {
    if (this._encryptionManager) return this._encryptionManager;
    const { EncryptionManager } = require("../utils/EncryptionManager");
    this._encryptionManager = new EncryptionManager();
    return this._encryptionManager;
  },

  encryptConfig: function (config = {}) {
    return this.encryptionManager().encrypt(JSON.stringify(config));
  },

  decryptConfig: function (record) {
    if (!record?.encryptedConfig) return null;
    const plain = this.encryptionManager().decrypt(record.encryptedConfig);
    if (!plain) return null;
    try {
      return JSON.parse(plain);
    } catch {
      return null;
    }
  },

  calcNextSync: function (record) {
    const interval = Math.max(
      this.minIntervalMs,
      Number(record?.intervalMs) || this.defaultIntervalMs
    );
    return new Date(Date.now() + interval);
  },

  create: async function ({
    workspaceId = null,
    type = null,
    config = null,
    intervalMs = null,
  } = {}) {
    if (!workspaceId) throw new Error("workspaceId is required");
    if (!this.validTypes.includes(type))
      throw new Error(`Unsupported source type: ${type}`);
    if (!config || typeof config !== "object")
      throw new Error("config object is required");

    const encryptedConfig = this.encryptConfig(config);
    if (!encryptedConfig) throw new Error("Failed to encrypt config");

    const effectiveInterval = Math.max(
      this.minIntervalMs,
      Number(intervalMs) || this.defaultIntervalMs
    );

    try {
      const record = await prisma.source_sync_configs.create({
        data: {
          workspaceId: Number(workspaceId),
          type: String(type),
          encryptedConfig,
          intervalMs: effectiveInterval,
          nextSyncAt: new Date(Date.now() + effectiveInterval),
        },
      });
      await Telemetry.sendTelemetry("source_sync_config_created", { type });
      return record;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  update: async function (id = null, data = {}) {
    if (!id) throw new Error("No id provided for update");
    const validData = {};
    for (const key of Object.keys(data)) {
      if (this.writable.includes(key)) validData[key] = data[key];
    }
    if (data.config && typeof data.config === "object") {
      const encryptedConfig = this.encryptConfig(data.config);
      if (!encryptedConfig) throw new Error("Failed to encrypt config");
      validData.encryptedConfig = encryptedConfig;
    }
    if (validData.intervalMs !== undefined) {
      validData.intervalMs = Math.max(
        this.minIntervalMs,
        Number(validData.intervalMs) || this.defaultIntervalMs
      );
    }
    if (Object.keys(validData).length === 0) return null;
    validData.lastUpdatedAt = new Date();
    try {
      return await prisma.source_sync_configs.update({
        where: { id: Number(id) },
        data: validData,
      });
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  _internalUpdate: async function (id = null, data = {}) {
    if (!id) return null;
    try {
      return await prisma.source_sync_configs.update({
        where: { id: Number(id) },
        data,
      });
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.source_sync_configs.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  get: async function (clause = {}, include = null) {
    try {
      return await prisma.source_sync_configs.findFirst({
        where: clause,
        ...(include !== null ? { include } : {}),
      });
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    include = null
  ) {
    try {
      return await prisma.source_sync_configs.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
        ...(include !== null ? { include } : {}),
      });
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  staleSources: async function () {
    return await this.where(
      { nextSyncAt: { lte: new Date() } },
      null,
      { nextSyncAt: "asc" },
      { workspace: true }
    );
  },

  forceSync: async function (id = null) {
    return this._internalUpdate(id, { nextSyncAt: new Date(Date.now() - 1000) });
  },

  markSuccess: async function (id = null) {
    const now = new Date();
    const record = await this.get({ id: Number(id) });
    if (!record) return null;
    return this._internalUpdate(id, {
      lastSyncedAt: now,
      nextSyncAt: this.calcNextSync(record),
      failureCount: 0,
    });
  },

  markFailure: async function (id = null) {
    const record = await this.get({ id: Number(id) });
    if (!record) return null;
    const nextFailureCount = (record.failureCount || 0) + 1;
    const backoff =
      nextFailureCount >= this.maxRepeatFailures
        ? this.failureBackoffMs
        : Math.max(
            this.minIntervalMs,
            Number(record.intervalMs) || this.defaultIntervalMs
          );
    return this._internalUpdate(id, {
      lastSyncedAt: new Date(),
      nextSyncAt: new Date(Date.now() + backoff),
      failureCount: nextFailureCount,
    });
  },

  saveRun: async function (configId = null, status = null, result = {}) {
    const { SourceSyncRun } = require("./sourceSyncRun");
    return SourceSyncRun.save(configId, status, result);
  },
};

module.exports = { SourceSyncConfig };
