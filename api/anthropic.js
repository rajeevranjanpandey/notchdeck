// Optional Vercel serverless function: /api/anthropic?path=usage|cost&...
// The Anthropic Admin API does not accept browser requests, so when NotchDeck
// is hosted on Vercel this forwards the call. The admin key arrives in the
// X-Provider-Key header for that single request and is never stored or logged.

const PATHS = {
  usage: "/v1/organizations/usage_report/messages",
  cost: "/v1/organizations/cost_report",
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const { path, ...query } = req.query;
  const upstream = PATHS[path];
  if (!upstream) return res.status(404).json({ error: "Unknown path" });
  const key = req.headers["x-provider-key"];
  if (!key) return res.status(400).json({ error: "Missing X-Provider-Key header" });

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    for (const item of [].concat(v)) qs.append(k, item);
  }
  const r = await fetch(`https://api.anthropic.com${upstream}?${qs}`, {
    headers: { "x-api-key": String(key), "anthropic-version": "2023-06-01" },
  });
  const body = await r.json().catch(() => ({ error: `Upstream returned ${r.status}` }));
  return res.status(r.status).json(body);
}
