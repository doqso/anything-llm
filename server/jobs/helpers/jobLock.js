const { SystemSettings } = require("../../models/systemSettings");

const LOCK_KEY = "background_job_lock";
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 min

async function acquireLock(jobName) {
  const current = await SystemSettings.get({ label: LOCK_KEY });
  if (current?.value) {
    try {
      const held = JSON.parse(current.value);
      const ageMs = Date.now() - new Date(held.startedAt).getTime();
      if (ageMs < STALE_AFTER_MS) {
        return { acquired: false, holder: held.jobName };
      }
    } catch {
      /* malformed value — fall through and overwrite */
    }
  }
  await SystemSettings._updateSettings({
    [LOCK_KEY]: JSON.stringify({
      jobName,
      startedAt: new Date().toISOString(),
    }),
  });
  return { acquired: true, holder: jobName };
}

async function releaseLock(jobName) {
  const current = await SystemSettings.get({ label: LOCK_KEY });
  if (!current?.value) return;
  try {
    const held = JSON.parse(current.value);
    if (held.jobName !== jobName) return;
  } catch {
    /* malformed value — clear it */
  }
  await SystemSettings._updateSettings({ [LOCK_KEY]: "" });
}

module.exports = { acquireLock, releaseLock };
