// Sends alerts to Discord (webhook) and/or ntfy (topic URL), whichever are configured.
export function createNotifier({ fetch = globalThis.fetch, getSettings }) {
  async function send(title, message, { settings = getSettings() } = {}) {
    const jobs = [];
    if (settings.discordWebhook) {
      jobs.push(fetch(settings.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'RS Companion', embeds: [{ title, description: message, color: 0xd6b04a }] }),
      }).then((r) => { if (!r.ok) throw new Error(`Discord returned ${r.status}`); }));
    }
    if (settings.ntfyUrl) {
      jobs.push(fetch(settings.ntfyUrl, {
        method: 'POST',
        headers: { Title: title, Tags: 'crossed_swords' },
        body: message,
      }).then((r) => { if (!r.ok) throw new Error(`ntfy returned ${r.status}`); }));
    }
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
    if (failed.length) throw new Error(failed.join('; '));
    return jobs.length;
  }

  // Background alerts must never break the request that triggered them.
  function fire(title, message) {
    send(title, message).catch((err) => console.warn(`Alert failed: ${err.message}`));
  }

  return { send, fire };
}
