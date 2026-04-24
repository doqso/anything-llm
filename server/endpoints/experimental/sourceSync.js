const { EventLogs } = require("../../models/eventLogs");
const { SourceSyncConfig } = require("../../models/sourceSyncConfig");
const { SourceSyncRun } = require("../../models/sourceSyncRun");
const { SystemSettings } = require("../../models/systemSettings");
const { Telemetry } = require("../../models/telemetry");
const { Workspace } = require("../../models/workspace");
const { reqBody } = require("../../utils/http");
const {
  featureFlagEnabled,
} = require("../../utils/middleware/featureFlagEnabled");
const {
  flexUserRoleValid,
  ROLES,
} = require("../../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../../utils/middleware/validatedRequest");

function redact(record) {
  if (!record) return null;
  const { encryptedConfig, ...rest } = record;
  return rest;
}

function sourceSyncEndpoints(app) {
  if (!app) return;

  app.post(
    "/experimental/toggle-source-sync",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { updatedStatus = false } = reqBody(request);
        const newStatus =
          SystemSettings.validations.experimental_source_sync(updatedStatus);
        const currentStatus =
          (await SystemSettings.get({ label: "experimental_source_sync" }))
            ?.value || "disabled";
        if (currentStatus === newStatus)
          return response
            .status(200)
            .json({ sourceSyncEnabled: newStatus === "enabled" });

        await SystemSettings._updateSettings({
          experimental_source_sync: newStatus,
        });
        if (newStatus === "enabled") {
          await Telemetry.sendTelemetry("experimental_feature_enabled", {
            feature: "source_sync",
          });
          await EventLogs.logEvent("experimental_feature_enabled", {
            feature: "source_sync",
          });
          SourceSyncConfig.bootWorkers();
        } else {
          SourceSyncConfig.killWorkers();
        }

        return response
          .status(200)
          .json({ sourceSyncEnabled: newStatus === "enabled" });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.get(
    "/experimental/source-sync",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(SourceSyncConfig.featureKey),
    ],
    async (_, response) => {
      try {
        const records = await SourceSyncConfig.where(
          {},
          null,
          { createdAt: "asc" },
          { workspace: { select: { id: true, name: true, slug: true } } }
        );
        response
          .status(200)
          .json({ sources: records.map((r) => redact(r)) });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.post(
    "/experimental/source-sync",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(SourceSyncConfig.featureKey),
    ],
    async (request, response) => {
      try {
        const { workspaceId, type, config, intervalMs } = reqBody(request);
        if (!workspaceId || !type || !config)
          return response
            .status(400)
            .json({ error: "workspaceId, type and config are required." });

        const workspace = await Workspace.get({ id: Number(workspaceId) });
        if (!workspace)
          return response
            .status(404)
            .json({ error: `Workspace ${workspaceId} not found.` });

        if (!SourceSyncConfig.validTypes.includes(type))
          return response
            .status(400)
            .json({ error: `Unsupported source type: ${type}.` });

        const record = await SourceSyncConfig.create({
          workspaceId: workspace.id,
          type,
          config,
          intervalMs,
        });
        if (!record)
          return response
            .status(500)
            .json({ error: "Failed to create source sync config." });

        response.status(200).json({ source: redact(record) });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.patch(
    "/experimental/source-sync/:id",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(SourceSyncConfig.featureKey),
    ],
    async (request, response) => {
      try {
        const id = Number(request.params.id);
        const body = reqBody(request);
        const record = await SourceSyncConfig.update(id, body);
        if (!record) return response.sendStatus(404);
        response.status(200).json({ source: redact(record) });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.delete(
    "/experimental/source-sync/:id",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(SourceSyncConfig.featureKey),
    ],
    async (request, response) => {
      try {
        const id = Number(request.params.id);
        await SourceSyncConfig.delete({ id });
        response.sendStatus(204);
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.post(
    "/experimental/source-sync/:id/force",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(SourceSyncConfig.featureKey),
    ],
    async (request, response) => {
      try {
        const id = Number(request.params.id);
        const updated = await SourceSyncConfig.forceSync(id);
        if (!updated) return response.sendStatus(404);
        response.status(202).json({ source: redact(updated) });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );

  app.get(
    "/experimental/source-sync/:id/runs",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin]),
      featureFlagEnabled(SourceSyncConfig.featureKey),
    ],
    async (request, response) => {
      try {
        const id = Number(request.params.id);
        const runs = await SourceSyncRun.where(
          { configId: id },
          25,
          { createdAt: "desc" }
        );
        response.status(200).json({ runs });
      } catch (e) {
        console.error(e);
        response.status(500).end();
      }
    }
  );
}

module.exports = { sourceSyncEndpoints };
