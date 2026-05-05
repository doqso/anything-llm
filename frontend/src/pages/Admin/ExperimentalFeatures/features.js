import LiveSyncToggle from "./Features/LiveSync/toggle";
import SourceSyncToggle from "./Features/SourceSync/toggle";

export const configurableFeatures = {
  experimental_live_file_sync: {
    title: "Live Document Sync",
    component: LiveSyncToggle,
    key: "experimental_live_file_sync",
  },
  experimental_source_sync: {
    title: "BookStack Source Sync",
    component: SourceSyncToggle,
    key: "experimental_source_sync",
  },
};
