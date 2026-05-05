const { DocumentSyncQueue } = require("../../models/documentSyncQueue");
const { Document } = require("../../models/documents");
const { EventLogs } = require("../../models/eventLogs");
const { SystemSettings } = require("../../models/systemSettings");
const { Telemetry } = require("../../models/telemetry");
const { reqBody } = require("../../utils/http");
const { isValidTimezone } = require("../../utils/scheduling/anchor");
const {
  featureFlagEnabled,
} = require("../../utils/middleware/featureFlagEnabled");
const {
  flexUserRoleValid,
  ROLES,
} = require("../../utils/middleware/multiUserProtected");
const { validWorkspaceSlug } = require("../../utils/middleware/validWorkspace");
const { validatedRequest } = require("../../utils/middleware/validatedRequest");

const LIVE_SYNC_INTERVAL_PRESETS = [3600000, 21600000, 43200000, 86400000]; // 1h, 6h, 12h, 24h

function liveSyncEndpoints(app) {
  if (!app) return;

  app.post(
    "/experimental/toggle-live-sync",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { updatedStatus = false } = reqBody(request);
        const newStatus =
          SystemSettings.validations.experimental_live_file_sync(updatedStatus);
        const currentStatus =
          (await SystemSettings.get({ label: "experimental_live_file_sync" }))
            ?.value || "disabled";
        if (currentStatus === newStatus)
          return response
            .status(200)
            .json({ liveSyncEnabled: newStatus === "enabled" });

        // Already validated earlier - so can hot update.
        await SystemSettings._updateSettings({
          experimental_live_file_sync: newStatus,
        });
        if (newStatus === "enabled") {
          await Telemetry.sendTelemetry("experimental_feature_enabled", {
            feature: "live_file_sync",
          });
          await EventLogs.logEvent("experimental_feature_enabled", {
            feature: "live_file_sync",
          });
          DocumentSyncQueue.bootWorkers();
        } else {
          DocumentSyncQueue.killWorkers();
        }

        response.status(200).json({ liveSyncEnabled: newStatus === "enabled" });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.get(
    "/experimental/live-sync/queues",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(DocumentSyncQueue.featureKey),
    ],
    async (_, response) => {
      const queues = await DocumentSyncQueue.where(
        {},
        null,
        { createdAt: "asc" },
        {
          workspaceDoc: {
            include: {
              workspace: true,
            },
          },
        }
      );
      response.status(200).json({ queues });
    }
  );

  // Should be in workspace routes, but is here for now.
  app.post(
    "/workspace/:slug/update-watch-status",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      validWorkspaceSlug,
      featureFlagEnabled(DocumentSyncQueue.featureKey),
    ],
    async (request, response) => {
      try {
        const { docPath, docPaths = [], watchStatus = false } = reqBody(request);
        const workspace = response.locals.workspace;
        const pathsToUpdate = Array.isArray(docPaths) ? docPaths : [];

        if (pathsToUpdate.length > 0) {
          const documents = await Document.where({
            workspaceId: workspace.id,
            docpath: { in: pathsToUpdate },
          });
          const documentsByPath = new Map(
            documents.map((document) => [document.docpath, document])
          );
          const result = { updated: 0, skipped: 0, failed: [] };

          for (const path of pathsToUpdate) {
            const document = documentsByPath.get(path);
            if (!document) {
              result.failed.push({ docPath: path, reason: "Document not found." });
              continue;
            }
            if (document.watched === watchStatus) {
              result.skipped += 1;
              continue;
            }

            await DocumentSyncQueue.toggleWatchStatus(document, watchStatus);
            result.updated += 1;
          }

          return response.status(200).json({ success: true, ...result });
        }

        const document = await Document.get({
          workspaceId: workspace.id,
          docpath: docPath,
        });
        if (!document) return response.sendStatus(404).end();

        await DocumentSyncQueue.toggleWatchStatus(document, watchStatus);
        return response.status(200).end();
      } catch (error) {
        console.error("Error processing the watch status update:", error);
        return response.status(500).end();
      }
    }
  );

  app.get(
    "/experimental/live-sync/interval",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        const intervalRecord = await SystemSettings.get({
          label: "live_file_sync_interval_ms",
        });
        const startMinRecord = await SystemSettings.get({
          label: "live_file_sync_start_minute_of_day",
        });
        const startTzRecord = await SystemSettings.get({
          label: "live_file_sync_start_timezone",
        });
        const intervalMs = Number(intervalRecord?.value) || 3600000;
        const startMinValue = startMinRecord?.value;
        const startMinuteOfDay =
          startMinValue === "" || startMinValue == null
            ? null
            : Number(startMinValue);
        const startTimezone = startTzRecord?.value || null;
        return response.status(200).json({
          intervalMs,
          startMinuteOfDay: Number.isInteger(startMinuteOfDay)
            ? startMinuteOfDay
            : null,
          startTimezone: startTimezone || null,
        });
      } catch (e) {
        console.error(e);
        return response.status(500).end();
      }
    }
  );

  app.post(
    "/experimental/live-sync/interval",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { intervalMs, startMinuteOfDay, startTimezone } =
          reqBody(request);
        const validatedInterval =
          SystemSettings.validations.live_file_sync_interval_ms(intervalMs);

        // Anchor must be both-set or both-empty
        const hasMin =
          startMinuteOfDay !== undefined &&
          startMinuteOfDay !== null &&
          startMinuteOfDay !== "";
        const hasTz =
          typeof startTimezone === "string" && startTimezone.length > 0;
        if (hasMin !== hasTz)
          return response.status(400).json({
            error:
              "startMinuteOfDay and startTimezone must be both set or both empty.",
          });

        let validatedStartMin = "";
        let validatedStartTz = "";
        if (hasMin && hasTz) {
          const sm = Number(startMinuteOfDay);
          if (!Number.isInteger(sm) || sm < 0 || sm > 1439)
            return response
              .status(400)
              .json({ error: "startMinuteOfDay must be 0-1439." });
          if (!isValidTimezone(startTimezone))
            return response.status(400).json({ error: "Invalid IANA timezone." });
          validatedStartMin = String(sm);
          validatedStartTz = String(startTimezone);
        }

        await SystemSettings._updateSettings({
          live_file_sync_interval_ms: validatedInterval,
          live_file_sync_start_minute_of_day: validatedStartMin,
          live_file_sync_start_timezone: validatedStartTz,
        });

        await DocumentSyncQueue.realignAllSchedules({
          intervalMs: validatedInterval,
          startMinuteOfDay: validatedStartMin === "" ? null : Number(validatedStartMin),
          startTimezone: validatedStartTz === "" ? null : validatedStartTz,
        });

        return response.status(200).json({
          intervalMs: validatedInterval,
          startMinuteOfDay:
            validatedStartMin === "" ? null : Number(validatedStartMin),
          startTimezone: validatedStartTz === "" ? null : validatedStartTz,
        });
      } catch (e) {
        console.error(e);
        return response.status(500).end();
      }
    }
  );
}

module.exports = { liveSyncEndpoints, LIVE_SYNC_INTERVAL_PRESETS };
