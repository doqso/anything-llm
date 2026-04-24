const prisma = require("../utils/prisma");

const SourceSyncRun = {
  statuses: {
    unknown: "unknown",
    exited: "exited",
    failed: "failed",
    success: "success",
  },

  save: async function (configId = null, status = null, result = {}) {
    try {
      if (!this.statuses.hasOwnProperty(status))
        throw new Error(
          `SourceSyncRun status ${status} is not a valid status.`
        );

      const run = await prisma.source_sync_executions.create({
        data: {
          configId: Number(configId),
          status: String(status),
          result: JSON.stringify(result),
        },
      });
      return run || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  get: async function (clause = {}) {
    try {
      const run = await prisma.source_sync_executions.findFirst({
        where: clause,
      });
      return run || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    include = {}
  ) {
    try {
      const results = await prisma.source_sync_executions.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
        ...(include !== null ? { include } : {}),
      });
      return results;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      return await prisma.source_sync_executions.count({ where: clause });
    } catch (error) {
      console.error("FAILED TO COUNT SOURCE SYNC RUNS.", error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.source_sync_executions.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { SourceSyncRun };
