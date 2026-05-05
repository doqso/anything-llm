import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import System from "@/models/system";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import {
  ArrowClockwise,
  ClockCounterClockwise,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  browserTimezone,
  hhmmToMinuteOfDay,
  minuteOfDayToHHMM,
} from "@/utils/scheduleAnchor";

const INTERVAL_OPTIONS = [
  { label: "1 hour", value: 3600000 },
  { label: "6 hours", value: 21600000 },
  { label: "12 hours", value: 43200000 },
  { label: "24 hours", value: 86400000 },
];

function msToLabel(ms) {
  const opt = INTERVAL_OPTIONS.find((o) => o.value === Number(ms));
  if (opt) return opt.label;
  const h = Math.round(Number(ms) / 3600000);
  return `${h}h`;
}

function formatDate(dateStr) {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString();
}

function timeUntil(dateStr) {
  if (!dateStr) return "—";
  const diff = new Date(dateStr) - Date.now();
  if (diff <= 0) return "Overdue";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SourceSyncManage() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <SourceSyncContainer />
        </div>
      </div>
    </div>
  );
}

function SourceSyncContainer() {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [historySource, setHistorySource] = useState(null);
  const [editScheduleSource, setEditScheduleSource] = useState(null);

  async function refresh() {
    setLoading(true);
    const data = await System.experimentalFeatures.sourceSync.getSources();
    setSources(data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Remove this BookStack source? This will not delete already-embedded documents."))
      return;
    const ok = await System.experimentalFeatures.sourceSync.deleteSource(id);
    if (!ok) {
      showToast("Failed to delete source.", "error", { clear: true });
      return;
    }
    showToast("Source removed.", "success", { clear: true });
    refresh();
  }

  async function handleForceSync(id) {
    const ok = await System.experimentalFeatures.sourceSync.forceSync(id);
    if (!ok) {
      showToast("Failed to trigger sync.", "error", { clear: true });
      return;
    }
    showToast("Sync scheduled — will run within the next polling cycle.", "success", { clear: true });
    refresh();
  }

  return (
    <>
      <div className="w-full flex flex-col gap-y-1 pb-6 border-white/10 border-b-2">
        <div className="items-center flex justify-between gap-x-4">
          <div>
            <p className="text-lg leading-6 font-bold text-theme-text-primary">
              BookStack Sources
            </p>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary mt-1">
              Each source monitors a BookStack instance and keeps the linked
              workspace in sync — adding new pages and removing deleted ones.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-x-1 border border-slate-200 px-4 py-2 rounded-lg text-white text-sm hover:bg-slate-200 hover:text-slate-800 shrink-0"
          >
            <Plus size={16} />
            New source
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton.default
          height="60vh"
          width="100%"
          highlightColor="var(--theme-bg-primary)"
          baseColor="var(--theme-bg-secondary)"
          count={1}
          className="w-full p-4 rounded-b-2xl rounded-tr-2xl rounded-tl-sm mt-6"
          containerClassName="flex w-full"
        />
      ) : (
        <div className="overflow-x-auto mt-6">
          {sources.length === 0 ? (
            <p className="text-theme-text-secondary text-sm text-center py-12">
              No BookStack sources configured. Click "New source" to add one.
            </p>
          ) : (
            <table className="w-full text-sm text-left rounded-lg min-w-[700px]">
              <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-white/10 border-b">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Workspace</th>
                  <th className="px-4 py-3">BookStack URL</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Last synced</th>
                  <th className="px-4 py-3">Next sync</th>
                  <th className="px-4 py-3 rounded-tr-lg"> </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    onDelete={() => handleDelete(source.id)}
                    onForceSync={() => handleForceSync(source.id)}
                    onHistory={() => setHistorySource(source)}
                    onEditSchedule={() => setEditScheduleSource(source)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showNew && (
        <NewSourceModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {historySource && (
        <RunHistoryModal
          source={historySource}
          onClose={() => setHistorySource(null)}
        />
      )}

      {editScheduleSource && (
        <EditScheduleModal
          source={editScheduleSource}
          onClose={() => setEditScheduleSource(null)}
          onSaved={() => {
            setEditScheduleSource(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function SourceRow({ source, onDelete, onForceSync, onHistory, onEditSchedule }) {
  const intervalLabel = msToLabel(source.intervalMs);
  const startLabel =
    source.startMinuteOfDay != null
      ? `at ${minuteOfDayToHHMM(source.startMinuteOfDay)}`
      : null;

  return (
    <tr className="border-b border-white/5 hover:bg-theme-file-picker-hover">
      <td className="px-4 py-3 text-theme-text-primary font-medium">
        {source.workspace?.name ?? `Workspace #${source.workspaceId}`}
      </td>
      <td className="px-4 py-3 text-theme-text-secondary font-mono text-xs truncate max-w-[200px]">
        {source.baseUrl ?? "—"}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onEditSchedule}
          className="flex items-center gap-x-2 text-theme-text-primary hover:text-white transition-colors text-xs"
        >
          <span>
            every {intervalLabel}
            {startLabel ? ` ${startLabel}` : ""}
          </span>
          <PencilSimple size={12} className="opacity-60" />
        </button>
      </td>
      <td className="px-4 py-3 text-theme-text-secondary text-xs">
        {formatDate(source.lastSyncedAt)}
      </td>
      <td className="px-4 py-3 text-theme-text-secondary text-xs">
        {timeUntil(source.nextSyncAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-x-3 justify-end">
          <button
            onClick={onForceSync}
            title="Force sync now"
            className="text-theme-text-secondary hover:text-white transition-colors"
          >
            <ArrowClockwise size={16} />
          </button>
          <button
            onClick={onHistory}
            title="View run history"
            className="text-theme-text-secondary hover:text-white transition-colors"
          >
            <ClockCounterClockwise size={16} />
          </button>
          <button
            onClick={onDelete}
            title="Delete source"
            className="text-theme-text-secondary hover:text-red-400 transition-colors"
          >
            <Trash size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditScheduleModal({ source, onClose, onSaved }) {
  const [intervalMs, setIntervalMs] = useState(source.intervalMs);
  const [startTime, setStartTime] = useState(
    source.startMinuteOfDay != null
      ? minuteOfDayToHHMM(source.startMinuteOfDay)
      : "12:00"
  );
  const [useAnchor, setUseAnchor] = useState(source.startMinuteOfDay != null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const startMinuteOfDay = useAnchor ? hhmmToMinuteOfDay(startTime) : null;
    const startTimezone = useAnchor ? browserTimezone() : null;
    const res = await System.experimentalFeatures.sourceSync.updateSource(
      source.id,
      {
        intervalMs: Number(intervalMs),
        startMinuteOfDay,
        startTimezone,
      }
    );
    setSaving(false);
    if (!res.success) {
      showToast(res.error || "Failed to update schedule.", "error", { clear: true });
      return;
    }
    showToast("Schedule updated.", "success", { clear: true });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-theme-bg-secondary border border-theme-modal-border rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-theme-text-primary text-lg font-bold">
            Edit schedule
          </h3>
          <button onClick={onClose} className="text-theme-text-secondary hover:text-white">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <label className="text-theme-text-primary text-sm font-semibold">
              Interval
            </label>
            <select
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useAnchor}
              onChange={(e) => setUseAnchor(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-theme-text-primary text-sm">
              Anchor to a specific start time
            </span>
          </label>

          {useAnchor && (
            <div className="flex flex-col gap-y-1">
              <label className="text-theme-text-primary text-sm font-semibold">
                Start time ({browserTimezone()})
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm w-fit"
              />
              <p className="text-theme-text-secondary text-xs">
                The schedule will align to this time of day. Useful to stagger
                jobs that share the same interval.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-theme-text-secondary hover:text-white border border-theme-modal-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-white text-black hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewSourceModal({ onClose, onCreated }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [form, setForm] = useState({
    workspaceId: "",
    baseUrl: "",
    tokenId: "",
    tokenSecret: "",
    bypassSSL: false,
    intervalMs: 3600000,
    useAnchor: false,
    startTime: "12:00",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Workspace.all().then((list) => {
      setWorkspaces(Array.isArray(list) ? list : []);
      if (list?.length > 0) setForm((f) => ({ ...f, workspaceId: list[0].id }));
    });
  }, []);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.workspaceId || !form.baseUrl || !form.tokenId || !form.tokenSecret) {
      showToast("All fields except Bypass SSL are required.", "error", { clear: true });
      return;
    }
    setSaving(true);
    const startMinuteOfDay = form.useAnchor
      ? hhmmToMinuteOfDay(form.startTime)
      : null;
    const startTimezone = form.useAnchor ? browserTimezone() : null;
    const { success, error } = await System.experimentalFeatures.sourceSync.createSource({
      workspaceId: Number(form.workspaceId),
      config: {
        baseUrl: form.baseUrl,
        tokenId: form.tokenId,
        tokenSecret: form.tokenSecret,
        bypassSSL: form.bypassSSL,
      },
      intervalMs: Number(form.intervalMs),
      startMinuteOfDay,
      startTimezone,
    });
    setSaving(false);
    if (!success) {
      showToast(error || "Failed to create source.", "error", { clear: true });
      return;
    }
    showToast("BookStack source created.", "success", { clear: true });
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-theme-bg-secondary border border-theme-modal-border rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-theme-text-primary text-lg font-bold">
            Add BookStack Source
          </h3>
          <button onClick={onClose} className="text-theme-text-secondary hover:text-white">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <label className="text-theme-text-primary text-sm font-semibold">
              Workspace
            </label>
            <select
              value={form.workspaceId}
              onChange={(e) => set("workspaceId", e.target.value)}
              className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-y-1">
            <label className="text-theme-text-primary text-sm font-semibold">
              BookStack URL
            </label>
            <input
              type="url"
              placeholder="https://bookstack.example.com"
              value={form.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm placeholder:text-theme-text-secondary"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <label className="text-theme-text-primary text-sm font-semibold">
              Token ID
            </label>
            <input
              type="text"
              placeholder="API Token ID"
              value={form.tokenId}
              onChange={(e) => set("tokenId", e.target.value)}
              className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm placeholder:text-theme-text-secondary"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <label className="text-theme-text-primary text-sm font-semibold">
              Token Secret
            </label>
            <input
              type="password"
              placeholder="API Token Secret"
              value={form.tokenSecret}
              onChange={(e) => set("tokenSecret", e.target.value)}
              className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm placeholder:text-theme-text-secondary"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <label className="text-theme-text-primary text-sm font-semibold">
              Sync interval
            </label>
            <select
              value={form.intervalMs}
              onChange={(e) => set("intervalMs", Number(e.target.value))}
              className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.useAnchor}
              onChange={(e) => set("useAnchor", e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-theme-text-primary text-sm">
              Anchor to a specific start time
            </span>
          </label>
          {form.useAnchor && (
            <div className="flex flex-col gap-y-1">
              <label className="text-theme-text-primary text-sm font-semibold">
                Start time ({browserTimezone()})
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm w-fit"
              />
            </div>
          )}
          <label className="flex items-center gap-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.bypassSSL}
              onChange={(e) => set("bypassSSL", e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-theme-text-secondary text-sm">
              Bypass SSL verification
            </span>
          </label>
          <div className="flex justify-end gap-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-theme-text-secondary hover:text-white border border-theme-modal-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-white text-black hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create source"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RunHistoryModal({ source, onClose }) {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    System.experimentalFeatures.sourceSync.getRuns(source.id).then((data) => {
      setRuns(data);
      setLoading(false);
    });
  }, [source.id]);

  const statusColor = {
    success: "text-green-400",
    failed: "text-red-400",
    exited: "text-yellow-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-theme-bg-secondary border border-theme-modal-border rounded-2xl w-full max-w-xl p-6 shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-theme-text-primary text-lg font-bold">
            Run history
          </h3>
          <button onClick={onClose} className="text-theme-text-secondary hover:text-white">
            <X size={20} />
          </button>
        </div>
        <p className="text-theme-text-secondary text-xs mb-4">
          Last 25 runs for this source.
        </p>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="text-theme-text-secondary text-sm text-center py-8">
              Loading…
            </p>
          ) : runs.length === 0 ? (
            <p className="text-theme-text-secondary text-sm text-center py-8">
              No runs recorded yet.
            </p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="text-theme-text-secondary font-bold uppercase border-b border-white/10">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Added</th>
                  <th className="px-3 py-2">Removed</th>
                  <th className="px-3 py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const result = run.result
                    ? (typeof run.result === "string" ? JSON.parse(run.result) : run.result)
                    : {};
                  return (
                    <tr key={run.id} className="border-b border-white/5">
                      <td className="px-3 py-2 text-theme-text-secondary">
                        {formatDate(run.createdAt)}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${statusColor[run.status] ?? "text-theme-text-secondary"}`}>
                        {run.status}
                      </td>
                      <td className="px-3 py-2 text-theme-text-primary">
                        {result.added ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-theme-text-primary">
                        {result.removed ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-red-400">
                        {result.errors?.length
                          ? result.errors.join("; ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
