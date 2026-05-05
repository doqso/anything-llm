import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const LiveDocumentSync = {
  featureFlag: "experimental_live_file_sync",
  toggleFeature: async function (updatedStatus = false) {
    return await fetch(`${API_BASE}/experimental/toggle-live-sync`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ updatedStatus }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not update status.");
        return true;
      })
      .then((res) => res)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  queues: async function () {
    return await fetch(`${API_BASE}/experimental/live-sync/queues`, {
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not update status.");
        return res.json();
      })
      .then((res) => res?.queues || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },

  // Should be in Workspaces but is here for now while in preview
  setWatchStatusForDocument: async function (slug, docPath, watchStatus) {
    return fetch(`${API_BASE}/workspace/${slug}/update-watch-status`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ docPath, watchStatus }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.statusText || "Error setting watch status for document."
          );
        }
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  setWatchStatusForDocuments: async function (slug, docPaths = [], watchStatus) {
    return fetch(`${API_BASE}/workspace/${slug}/update-watch-status`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ docPaths, watchStatus }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.statusText || "Error setting watch status for documents."
          );
        }
        return res.json();
      })
      .then((res) => ({ success: true, ...res }))
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  getSchedule: async function () {
    return fetch(`${API_BASE}/experimental/live-sync/interval`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => ({
        intervalMs: res?.intervalMs ?? 3600000,
        startMinuteOfDay: res?.startMinuteOfDay ?? null,
        startTimezone: res?.startTimezone ?? null,
      }))
      .catch(() => ({
        intervalMs: 3600000,
        startMinuteOfDay: null,
        startTimezone: null,
      }));
  },
  setSchedule: async function ({
    intervalMs,
    startMinuteOfDay = null,
    startTimezone = null,
  }) {
    return fetch(`${API_BASE}/experimental/live-sync/interval`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ intervalMs, startMinuteOfDay, startTimezone }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data.error || "Could not update schedule.");
        return data;
      })
      .then((res) => ({
        success: true,
        intervalMs: res.intervalMs,
        startMinuteOfDay: res.startMinuteOfDay ?? null,
        startTimezone: res.startTimezone ?? null,
      }))
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default LiveDocumentSync;
