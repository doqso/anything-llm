import System from "@/models/system";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { useState } from "react";
import { Link } from "react-router-dom";
import Toggle from "@/components/lib/Toggle";

export default function SourceSyncToggle({ enabled = false, onToggle }) {
  const [status, setStatus] = useState(enabled);

  async function toggleFeatureFlag() {
    const updated =
      await System.experimentalFeatures.sourceSync.toggleFeature(!status);
    if (!updated) {
      showToast("Failed to update status of feature.", "error", {
        clear: true,
      });
      return false;
    }

    setStatus(!status);
    showToast(
      `BookStack source sync has been ${!status ? "enabled" : "disabled"}.`,
      "success",
      { clear: true }
    );
    onToggle();
  }

  return (
    <div className="p-4">
      <div className="flex flex-col gap-y-6 max-w-[500px]">
        <div className="flex items-center justify-between">
          <h2 className="text-theme-text-primary text-md font-bold">
            BookStack Source Sync
          </h2>
          <Toggle size="lg" enabled={status} onChange={toggleFeatureFlag} />
        </div>
        <div className="flex flex-col space-y-4">
          <p className="text-theme-text-secondary text-sm">
            Monitor entire BookStack instances for changes. When enabled,
            AnythingLLM will periodically compare the pages in your BookStack
            with the documents in your workspace.
          </p>
          <p className="text-theme-text-secondary text-sm">
            New pages are automatically fetched, embedded, and marked as
            watched. Pages deleted from BookStack are removed from your
            workspace embeddings.
          </p>
          <p className="text-theme-text-secondary text-xs italic">
            This feature requires configuring at least one BookStack source with
            your instance URL and API credentials.
          </p>
        </div>
      </div>
      <div className="mt-8">
        <ul className="space-y-2">
          <li>
            <Link
              to={paths.experimental.sourceSync.manage()}
              className="text-sm text-blue-400 light:text-blue-500 hover:underline"
            >
              Manage BookStack Sources &rarr;
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
