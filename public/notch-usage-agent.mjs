#!/usr/bin/env node
// NotchDeck usage agent
// A tiny local server (no dependencies) that lets the NotchDeck web app read
// your Codex and Claude Code usage logs and call the Anthropic Admin API,
// which browsers cannot call directly.
//
// Run:   node companion/notch-usage-agent.mjs
// Then paste the printed pairing code into NotchDeck > AI Usage > Local agent.
//
// Safety:
//   - Listens on 127.0.0.1 only.
//   - Every request needs the pairing code in the X-NotchDeck-Token header.
//   - API keys are forwarded per request and never written to disk.
//   - Log files are read, never modified.

import http from "node:http";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

// ---- shared usage logic (inlined from shared/usage-core.mjs) ----
// Shared usage logic for NotchDeck.
// The browser app and the local companion agent both import this file,
// so a Codex or Claude Code log is read exactly the same way in both places.
// No network calls happen here; every function is pure and easy to test.

const DAY_MS = 86_400_000;
const FIVE_HOURS_MS = 5 * 3_600_000;

/** Turn a "YYYY-MM-DD" key from a Date in the user's local time. */
function dayKey(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Friendly name for a rate-limit window measured in minutes. */
function windowLabel(minutes) {
  if (minutes == null) return "Window";
  if (minutes >= 290 && minutes <= 310) return "5-hour";
  if (minutes >= 10_000 && minutes <= 10_100) return "Weekly";
  if (minutes >= 43_000 && minutes <= 44_700) return "30-day";
  if (minutes < 120) return `${minutes}-minute`;
  if (minutes < 2_880) return `${Math.round(minutes / 60)}-hour`;
  return `${Math.round(minutes / 1_440)}-day`;
}

function safeJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function emptyTokens() {
  return { input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 };
}

function addTokens(target, add) {
  for (const k of Object.keys(target)) target[k] += add[k] || 0;
  return target;
}

function bump(map, key, tokens) {
  if (!map[key]) map[key] = emptyTokens();
  addTokens(map[key], tokens);
}

/* ------------------------------------------------------------------ */
/* Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl             */
/* ------------------------------------------------------------------ */

function codexTokens(u) {
  if (!u) return null;
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  return {
    input,
    cachedInput: u.cached_input_tokens || 0,
    cacheWrite: u.cache_write_input_tokens || 0,
    output,
    reasoning: u.reasoning_output_tokens || 0,
    total: u.total_tokens || input + output,
  };
}

function codexWindow(w, eventTime) {
  if (!w || typeof w.used_percent !== "number") return null;
  let resetsAt = null;
  if (typeof w.resets_at === "number") resetsAt = w.resets_at * 1000;
  else if (typeof w.resets_in_seconds === "number" && eventTime) {
    resetsAt = eventTime + w.resets_in_seconds * 1000;
  }
  return {
    label: windowLabel(w.window_minutes),
    windowMinutes: w.window_minutes ?? null,
    usedPercent: w.used_percent,
    resetsAt,
  };
}

/**
 * Parse one or more Codex rollout files.
 * @param {{name: string, text: string}[]} files
 */
function parseCodexSessions(files, now = Date.now()) {
  const totals = emptyTokens();
  const byDay = {};
  const byModel = {};
  let latestLimits = null;
  let latestLimitsAt = 0;
  let sessions = 0;
  let turns = 0;
  let lastActivity = 0;

  for (const file of files) {
    let model = "unknown";
    let fileTurns = 0;
    let lastTotal = null;
    let lastTotalAt = 0;
    const perTurn = [];

    for (const line of file.text.split("\n")) {
      if (!line.trim()) continue;
      const row = safeJson(line);
      if (!row) continue;
      const t = row.timestamp ? Date.parse(row.timestamp) : 0;
      const p = row.payload || {};

      if (row.type === "turn_context" && p.model) model = p.model;
      if (row.type === "session_meta" && p.model) model = p.model;
      if (!(row.type === "event_msg" && p.type === "token_count")) continue;

      if (p.info?.last_token_usage) {
        perTurn.push({ t, model, tokens: codexTokens(p.info.last_token_usage) });
      }
      if (p.info?.total_token_usage) {
        lastTotal = codexTokens(p.info.total_token_usage);
        lastTotalAt = t;
      }
      if (p.rate_limits && t >= latestLimitsAt) {
        const primary = codexWindow(p.rate_limits.primary, t);
        const secondary = codexWindow(p.rate_limits.secondary, t);
        if (primary || secondary) {
          latestLimits = {
            primary,
            secondary,
            planType: p.rate_limits.plan_type || null,
            limitId: p.rate_limits.limit_id || null,
          };
          latestLimitsAt = t;
        }
      }
      if (t > lastActivity) lastActivity = t;
    }

    // Per-turn numbers are exact. The running total is only a fallback,
    // and we take its final value once so it is never double counted.
    if (perTurn.length) {
      for (const turn of perTurn) {
        addTokens(totals, turn.tokens);
        bump(byDay, dayKey(turn.t || now), turn.tokens);
        bump(byModel, turn.model, turn.tokens);
        fileTurns++;
      }
    } else if (lastTotal) {
      addTokens(totals, lastTotal);
      bump(byDay, dayKey(lastTotalAt || now), lastTotal);
      bump(byModel, model, lastTotal);
      fileTurns++;
    }
    if (fileTurns) {
      sessions++;
      turns += fileTurns;
    }
  }

  return {
    provider: "codex",
    totals,
    byDay,
    byModel,
    sessions,
    turns,
    lastActivity: lastActivity || null,
    rateLimits: latestLimits,
    rateLimitsObservedAt: latestLimitsAt || null,
  };
}

/* ------------------------------------------------------------------ */
/* Claude Code: ~/.claude/projects/<project>/<session>.jsonl           */
/* ------------------------------------------------------------------ */

/**
 * Parse Claude Code transcript files.
 * Streaming can write the same assistant message several times, so rows
 * are de-duplicated by message id plus request id.
 * @param {{name: string, text: string}[]} files
 */
function parseClaudeCodeSessions(files, now = Date.now()) {
  const totals = emptyTokens();
  const byDay = {};
  const byModel = {};
  const byProject = {};
  const seen = new Set();
  const entries = [];
  const sessionIds = new Set();
  let costUSD = 0;
  let hasCost = false;

  for (const file of files) {
    const project = (file.name.split("/").slice(-2, -1)[0] || "project").replace(/^-/, "");
    for (const line of file.text.split("\n")) {
      if (!line.trim()) continue;
      const row = safeJson(line);
      const usage = row?.message?.usage;
      if (!row || row.type !== "assistant" || !usage) continue;
      const id = `${row.message.id || ""}:${row.requestId || ""}`;
      if (id !== ":" && seen.has(id)) continue;
      seen.add(id);

      const tokens = {
        input: usage.input_tokens || 0,
        cachedInput: usage.cache_read_input_tokens || 0,
        cacheWrite: usage.cache_creation_input_tokens || 0,
        output: usage.output_tokens || 0,
        reasoning: 0,
        total: 0,
      };
      tokens.total = tokens.input + tokens.cachedInput + tokens.cacheWrite + tokens.output;
      const t = row.timestamp ? Date.parse(row.timestamp) : now;
      const model = row.message.model || "unknown";
      if (model === "<synthetic>") continue;

      addTokens(totals, tokens);
      bump(byDay, dayKey(t), tokens);
      bump(byModel, model, tokens);
      bump(byProject, project, tokens);
      if (typeof row.costUSD === "number") {
        costUSD += row.costUSD;
        hasCost = true;
      }
      if (row.sessionId) sessionIds.add(row.sessionId);
      entries.push({ t, tokens });
    }
  }

  entries.sort((a, b) => a.t - b.t);
  const blocks = buildFiveHourBlocks(entries);
  const last = blocks[blocks.length - 1];
  const activeBlock = last && now < last.end ? last : null;

  return {
    provider: "claude-code",
    totals,
    byDay,
    byModel,
    byProject,
    sessions: sessionIds.size || files.length,
    turns: entries.length,
    lastActivity: entries.length ? entries[entries.length - 1].t : null,
    costUSD: hasCost ? costUSD : null,
    activeBlock,
    recentBlocks: blocks.slice(-6),
  };
}

/**
 * Claude subscription limits reset on rolling five-hour blocks that begin
 * at the hour of the first message. This mirrors that rule so the panel
 * can show "tokens in the current block" and "time until it resets".
 */
function buildFiveHourBlocks(entries) {
  const blocks = [];
  let current = null;
  for (const e of entries) {
    if (!current || e.t >= current.end) {
      const start = new Date(e.t);
      start.setMinutes(0, 0, 0);
      current = { start: start.getTime(), end: start.getTime() + FIVE_HOURS_MS, tokens: emptyTokens(), messages: 0 };
      blocks.push(current);
    }
    addTokens(current.tokens, e.tokens);
    current.messages++;
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Remote provider responses                                            */
/* ------------------------------------------------------------------ */

/** OpenRouter GET /api/v1/key -> one normalized card. Credits are USD. */
function normalizeOpenRouter(json) {
  const d = json?.data ?? json ?? {};
  return {
    provider: "openrouter",
    label: d.label || "OpenRouter key",
    unit: "USD",
    spentTotal: num(d.usage),
    spentToday: num(d.usage_daily),
    spentWeek: num(d.usage_weekly),
    spentMonth: num(d.usage_monthly),
    limit: d.limit == null ? null : num(d.limit),
    remaining: d.limit_remaining == null ? null : num(d.limit_remaining),
    limitReset: d.limit_reset ?? null,
    freeTier: !!d.is_free_tier,
    freeRequests: d.free_model_daily_requests || null,
  };
}

/** OpenAI organization costs + completions usage pages. */
function normalizeOpenAI(costsJson, usageJson, now = Date.now()) {
  const today = dayKey(now);
  const monthPrefix = today.slice(0, 7);
  const daily = {};
  let month = 0;
  let total = 0;
  for (const bucket of costsJson?.data || []) {
    const key = dayKey(bucket.start_time * 1000);
    let sum = 0;
    for (const r of bucket.results || []) sum += num(r.amount?.value);
    daily[key] = (daily[key] || 0) + sum;
    total += sum;
    if (key.startsWith(monthPrefix)) month += sum;
  }
  const tokens = emptyTokens();
  let requests = 0;
  for (const bucket of usageJson?.data || []) {
    for (const r of bucket.results || []) {
      tokens.input += r.input_tokens || 0;
      tokens.cachedInput += r.input_cached_tokens || 0;
      tokens.output += r.output_tokens || 0;
      requests += r.num_model_requests || 0;
    }
  }
  tokens.total = tokens.input + tokens.output;
  return {
    provider: "openai",
    label: "OpenAI organization",
    unit: "USD",
    spentToday: daily[today] || 0,
    spentMonth: month,
    spentWindow: total,
    dailySpend: daily,
    tokens,
    requests,
  };
}

/** Anthropic cost_report (amounts are cents as decimal strings) + usage_report. */
function normalizeAnthropic(costJson, usageJson, now = Date.now()) {
  const today = dayKey(now);
  const monthPrefix = today.slice(0, 7);
  const daily = {};
  let month = 0;
  let total = 0;
  for (const bucket of costJson?.data || []) {
    const key = dayKey(Date.parse(bucket.starting_at));
    let cents = 0;
    for (const r of bucket.results || []) cents += num(r.amount);
    const usd = cents / 100;
    daily[key] = (daily[key] || 0) + usd;
    total += usd;
    if (key.startsWith(monthPrefix)) month += usd;
  }
  const tokens = emptyTokens();
  const byModel = {};
  for (const bucket of usageJson?.data || []) {
    for (const r of bucket.results || []) {
      const t = {
        input: r.uncached_input_tokens || 0,
        cachedInput: r.cache_read_input_tokens || 0,
        cacheWrite: (r.cache_creation?.ephemeral_1h_input_tokens || 0) + (r.cache_creation?.ephemeral_5m_input_tokens || 0),
        output: r.output_tokens || 0,
        reasoning: 0,
        total: 0,
      };
      t.total = t.input + t.cachedInput + t.cacheWrite + t.output;
      addTokens(tokens, t);
      bump(byModel, r.model || "all models", t);
    }
  }
  return {
    provider: "anthropic",
    label: "Anthropic organization",
    unit: "USD",
    spentToday: daily[today] || 0,
    spentMonth: month,
    spentWindow: total,
    dailySpend: daily,
    tokens,
    byModel,
  };
}

/** Read a value like "data.usage" or "credits[0].used" out of any JSON. */
function readPath(obj, path) {
  if (!path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Any other API with a JSON usage endpoint, described by the user. */
function normalizeCustom(json, cfg) {
  const used = readPath(json, cfg.usedPath);
  const limit = cfg.limitPath ? readPath(json, cfg.limitPath) : null;
  if (used === undefined) {
    throw new Error(`Could not find "${cfg.usedPath}" in the response.`);
  }
  return {
    provider: "custom",
    label: cfg.name || "Custom API",
    unit: cfg.unit || "USD",
    used: num(used),
    limit: limit == null ? null : num(limit),
  };
}

/** Percent of a budget, clamped to 0..100, or null when there is no budget. */
function budgetPercent(spent, budget) {
  if (!budget || budget <= 0 || spent == null) return null;
  return Math.max(0, Math.min(100, (spent / budget) * 100));
}

/** Pick the alert level for a percent value. */
function alertLevel(percent, warnAt = 75, critAt = 90) {
  if (percent == null) return "none";
  if (percent >= critAt) return "critical";
  if (percent >= warnAt) return "warning";
  return "ok";
}

function formatTokens(n) {
  if (n == null) return "–";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatMoney(n, unit = "USD") {
  if (n == null || Number.isNaN(n)) return "–";
  if (unit !== "USD") return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
  const digits = n !== 0 && Math.abs(n) < 1 ? 3 : 2;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

function formatCountdown(ms) {
  if (ms == null) return "–";
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${mins % 60}m`;
  return `${Math.round(h / 24)}d`;
}

/** Last N day keys ending today, oldest first, for small charts. */
function lastDays(n, now = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(now - i * DAY_MS));
  return out;
}

function num(v) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// ---- agent ----

const VERSION = "1.0.0";
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(flag("port", process.env.NOTCHDECK_PORT || 4777));
const TOKEN = flag("token", process.env.NOTCHDECK_TOKEN || randomBytes(9).toString("base64url"));
const DEFAULT_DAYS = 30;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

const home = homedir();
const codexRoot = join(process.env.CODEX_HOME || join(home, ".codex"), "sessions");
const claudeRoots = (process.env.CLAUDE_CONFIG_DIR
  ? process.env.CLAUDE_CONFIG_DIR.split(",").map((d) => join(d.trim(), "projects"))
  : [join(home, ".claude", "projects"), join(home, ".config", "claude", "projects")]
).filter((d) => existsSync(d));

// Re-reading big folders on every poll is wasteful, so unchanged files
// are served from memory (keyed by path + size + modified time).
const fileCache = new Map();

async function walkJsonl(root, sinceMs) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith(".jsonl")) {
        try {
          const s = await stat(p);
          if (s.mtimeMs >= sinceMs && s.size <= MAX_FILE_BYTES) out.push({ path: p, size: s.size, mtime: s.mtimeMs });
        } catch {
          /* file vanished between readdir and stat */
        }
      }
    }
  }
  await walk(root);
  return out;
}

async function loadFiles(list, root) {
  const files = [];
  for (const f of list) {
    const key = `${f.path}:${f.size}:${f.mtime}`;
    let text = fileCache.get(f.path)?.key === key ? fileCache.get(f.path).text : null;
    if (text == null) {
      text = await readFile(f.path, "utf8");
      fileCache.set(f.path, { key, text });
    }
    files.push({ name: f.path.slice(root.length + 1), text });
  }
  return files;
}

async function codexUsage(days) {
  if (!existsSync(codexRoot)) return { available: false, reason: `No folder at ${codexRoot}` };
  const since = Date.now() - days * 86_400_000;
  const list = await walkJsonl(codexRoot, since);
  const result = parseCodexSessions(await loadFiles(list, codexRoot));
  return { available: true, source: "local-agent", folder: codexRoot, files: list.length, days, ...result };
}

async function claudeUsage(days) {
  if (!claudeRoots.length) return { available: false, reason: "No Claude Code projects folder found" };
  const since = Date.now() - days * 86_400_000;
  const files = [];
  let count = 0;
  for (const root of claudeRoots) {
    const list = await walkJsonl(root, since);
    count += list.length;
    files.push(...(await loadFiles(list, root)));
  }
  const result = parseClaudeCodeSessions(files);
  return { available: true, source: "local-agent", folder: claudeRoots.join(", "), files: count, days, ...result };
}

// Only these upstream paths can be reached through the agent.
const ANTHROPIC_PATHS = new Set(["/v1/organizations/usage_report/messages", "/v1/organizations/cost_report"]);

async function proxyAnthropic(req, url) {
  const upstreamPath = url.pathname.replace(/^\/proxy\/anthropic/, "");
  if (!ANTHROPIC_PATHS.has(upstreamPath)) return { status: 404, body: { error: "Path not allowed" } };
  const key = req.headers["x-provider-key"];
  if (!key) return { status: 400, body: { error: "Missing X-Provider-Key header" } };
  const r = await fetch(`https://api.anthropic.com${upstreamPath}${url.search}`, {
    headers: { "x-api-key": String(key), "anthropic-version": "2023-06-01" },
  });
  return { status: r.status, body: await r.json().catch(() => ({ error: `Upstream returned ${r.status}` })) };
}

function send(res, origin, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "X-NotchDeck-Token, X-Provider-Key",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") return send(res, origin, 204, {});
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.headers["x-notchdeck-token"] !== TOKEN) {
    return send(res, origin, 401, { error: "Pairing code missing or wrong. Copy it from the agent window." });
  }
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || DEFAULT_DAYS));
  try {
    if (url.pathname === "/health") {
      return send(res, origin, 200, { ok: true, version: VERSION, codex: existsSync(codexRoot), claude: claudeRoots.length > 0 });
    }
    if (url.pathname === "/local/codex") return send(res, origin, 200, await codexUsage(days));
    if (url.pathname === "/local/claude") return send(res, origin, 200, await claudeUsage(days));
    if (url.pathname.startsWith("/proxy/anthropic/")) {
      const r = await proxyAnthropic(req, url);
      return send(res, origin, r.status, r.body);
    }
    return send(res, origin, 404, { error: "Unknown route" });
  } catch (err) {
    return send(res, origin, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  NotchDeck usage agent ${VERSION}`);
  console.log(`  Listening on   http://127.0.0.1:${PORT}`);
  console.log(`  Pairing code   ${TOKEN}`);
  console.log(`  Codex logs     ${existsSync(codexRoot) ? codexRoot : "not found"}`);
  console.log(`  Claude Code    ${claudeRoots.length ? claudeRoots.join(", ") : "not found"}\n`);
});
