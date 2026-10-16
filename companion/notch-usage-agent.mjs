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
import { parseCodexSessions, parseClaudeCodeSessions } from "../shared/usage-core.mjs";

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
