import System from "@/models/system";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Toggle from "@/components/lib/Toggle";
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

export default function LiveSyncToggle({ enabled = false, onToggle }) {
  const [status, setStatus] = useState(enabled);
  const [intervalMs, setIntervalMs] = useState(3600000);
  const [useAnchor, setUseAnchor] = useState(false);
  const [startTime, setStartTime] = useState("12:00");
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    System.experimentalFeatures.liveSync.getSchedule().then((s) => {
      setIntervalMs(s.intervalMs);
      if (s.startMinuteOfDay != null) {
        setUseAnchor(true);
        setStartTime(minuteOfDayToHHMM(s.startMinuteOfDay));
      }
    });
  }, []);

  async function toggleFeatureFlag() {
    const updated =
      await System.experimentalFeatures.liveSync.toggleFeature(!status);
    if (!updated) {
      showToast("Failed to update status of feature.", "error", {
        clear: true,
      });
      return false;
    }

    setStatus(!status);
    showToast(
      `Live document content sync has been ${
        !status ? "enabled" : "disabled"
      }.`,
      "success",
      { clear: true }
    );
    onToggle();
  }

  async function saveSchedule(updates) {
    const next = {
      intervalMs,
      useAnchor,
      startTime,
      ...updates,
    };
    setSavingSchedule(true);
    const result = await System.experimentalFeatures.liveSync.setSchedule({
      intervalMs: next.intervalMs,
      startMinuteOfDay: next.useAnchor
        ? hhmmToMinuteOfDay(next.startTime)
        : null,
      startTimezone: next.useAnchor ? browserTimezone() : null,
    });
    setSavingSchedule(false);
    if (!result.success) {
      showToast(result.error || "Failed to update schedule.", "error", {
        clear: true,
      });
      return;
    }
    setIntervalMs(next.intervalMs);
    setUseAnchor(next.useAnchor);
    setStartTime(next.startTime);
    showToast("Schedule updated for all watched documents.", "success", {
      clear: true,
    });
  }

  return (
    <div className="p-4">
      <div className="flex flex-col gap-y-6 max-w-[500px]">
        <div className="flex items-center justify-between">
          <h2 className="text-theme-text-primary text-md font-bold">
            Automatic Document Content Sync
          </h2>
          <Toggle size="lg" enabled={status} onChange={toggleFeatureFlag} />
        </div>
        <div className="flex flex-col space-y-4">
          <p className="text-theme-text-secondary text-sm">
            Enable the ability to specify a document to be "watched". Watched
            document's content will be regularly fetched and updated in
            AnythingLLM.
          </p>
          <p className="text-theme-text-secondary text-sm">
            Watched documents will automatically update in all workspaces they
            are referenced in at the same time of update.
          </p>
          <p className="text-theme-text-secondary text-xs italic">
            This feature only applies to web-based content, such as websites,
            Confluence, YouTube, and GitHub files.
          </p>
        </div>
        <div className="flex flex-col gap-y-2">
          <label className="text-theme-text-primary text-sm font-semibold">
            Check for updates every
          </label>
          <select
            value={intervalMs}
            onChange={(e) => saveSchedule({ intervalMs: Number(e.target.value) })}
            disabled={savingSchedule}
            className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm w-fit disabled:opacity-50"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-theme-text-secondary text-xs">
            Applies to all watched documents. Changing this updates existing
            watched documents immediately.
          </p>
        </div>

        <div className="flex flex-col gap-y-2">
          <label className="flex items-center gap-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useAnchor}
              disabled={savingSchedule}
              onChange={(e) => saveSchedule({ useAnchor: e.target.checked })}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-theme-text-primary text-sm font-semibold">
              Anchor to a specific start time
            </span>
          </label>
          {useAnchor && (
            <>
              <label className="text-theme-text-primary text-xs">
                Start time ({browserTimezone()})
              </label>
              <input
                type="time"
                value={startTime}
                disabled={savingSchedule}
                onChange={(e) => setStartTime(e.target.value)}
                onBlur={(e) => saveSchedule({ startTime: e.target.value })}
                className="bg-theme-settings-input-bg text-theme-text-primary border border-theme-modal-border rounded-lg px-3 py-2 text-sm w-fit disabled:opacity-50"
              />
              <p className="text-theme-text-secondary text-xs">
                The schedule aligns to this hour each day so jobs with the same
                interval can be staggered.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-8">
        <ul className="space-y-2">
          <li>
            <a
              href="https://docs.anythingllm.com/beta-preview/active-features/live-document-sync"
              target="_blank"
              className="text-sm text-blue-400 light:text-blue-500 hover:underline flex items-center gap-x-1"
              rel="noreferrer"
            >
              <ArrowSquareOut size={14} />
              <span>Feature Documentation and Warnings</span>
            </a>
          </li>
          <li>
            <Link
              to={paths.experimental.liveDocumentSync.manage()}
              className="text-sm text-blue-400 light:text-blue-500 hover:underline"
            >
              Manage Watched Documents &rarr;
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
