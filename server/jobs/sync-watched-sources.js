const { SourceSyncConfig } = require("../models/sourceSyncConfig");
const { SourceSyncRun } = require("../models/sourceSyncRun");
const { CollectorApi } = require("../utils/collectorApi");
const { reconcileSource } = require("../utils/sourceSync");
const { log, conclude } = require("./helpers/index.js");

(async () => {
  try {
    const sources = await SourceSyncConfig.staleSources();
    if (sources.length === 0) {
      log("No outstanding sources to sync. Exiting.");
      return;
    }

    const collector = new CollectorApi();
    if (!(await collector.online())) {
      log("Could not reach collector API. Exiting.");
      return;
    }

    log(`${sources.length} source(s) are stale and will be reconciled now.`);
    for (const source of sources) {
      // Claim: push nextSyncAt forward immediately so a second Bree tick firing
      // during this (potentially long) reconcile won't pick up the same source.
      await SourceSyncConfig._internalUpdate(source.id, {
        nextSyncAt: SourceSyncConfig.calcNextSync(source),
      });
      try {
        const result = await reconcileSource(source);
        await SourceSyncConfig.markSuccess(source.id);
        await SourceSyncConfig.saveRun(
          source.id,
          result.errors.length > 0
            ? SourceSyncRun.statuses.exited
            : SourceSyncRun.statuses.success,
          result
        );
        log(
          `Source ${source.id} (${source.type}) reconciled — added ${result.added}, removed ${result.removed}${result.errors.length ? ", errors " + result.errors.length : ""}.`
        );
      } catch (e) {
        console.error(e);
        await SourceSyncConfig.markFailure(source.id);
        await SourceSyncConfig.saveRun(
          source.id,
          SourceSyncRun.statuses.failed,
          { reason: e.message }
        );
        log(
          `Source ${source.id} (${source.type}) failed: ${e.message}. Backoff applied.`
        );
      }
    }
  } catch (e) {
    console.error(e);
    log(`errored with ${e.message}`);
  } finally {
    conclude();
  }
})();
