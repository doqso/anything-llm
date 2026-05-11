import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const SourceSync = {
  featureFlag: "experimental_source_sync",

  toggleFeature: async function (updatedStatus = false) {
    return fetch(`${API_BASE}/experimental/toggle-source-sync`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ updatedStatus }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not update status.");
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  },

  getSources: async function () {
    return fetch(`${API_BASE}/experimental/source-sync`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.sources || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },

  createSource: async function ({
    workspaceId,
    type,
    config,
    intervalMs,
    startMinuteOfDay = null,
    startTimezone = null,
  }) {
    return fetch(`${API_BASE}/experimental/source-sync`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        workspaceId,
        type,
        config,
        intervalMs,
        startMinuteOfDay,
        startTimezone,
      }),
    })
      .then((res) => res.json())
      .then((res) => ({ success: !res.error, error: res.error, source: res.source }))
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  updateSource: async function (id, data = {}) {
    return fetch(`${API_BASE}/experimental/source-sync/${id}`, {
      method: "PATCH",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => ({ success: !res.error, error: res.error, source: res.source }))
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  deleteSource: async function (id) {
    return fetch(`${API_BASE}/experimental/source-sync/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },

  forceSync: async function (id) {
    return fetch(`${API_BASE}/experimental/source-sync/${id}/force`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },

  getRuns: async function (id) {
    return fetch(`${API_BASE}/experimental/source-sync/${id}/runs`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.runs || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
};

export default SourceSync;
