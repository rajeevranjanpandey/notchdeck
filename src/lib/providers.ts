// Provider definitions and network fetchers for the AI usage tracker.
import {
  normalizeOpenRouter,
  normalizeOpenAI,
  normalizeAnthropic,
  normalizeCustom,
  parseCodexSessions,
  parseClaudeCodeSessions,
  budgetPercent,
} from "../../shared/usage-core.mjs";

export type ProviderKind = "openrouter" | "openai" | "anthropic" | "codex" | "claude-code" | "custom";

export interface CustomConfig {
  url: string;
  authHeader: string;
  authPrefix: string;
  usedPath: string;
  limitPath: string;
  unit: string;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  enabled: boolean;
  remember: boolean;
  /** Monthly budget in USD, or tokens per block for Claude Code. */
  budget: number | null;
  custom?: CustomConfig;
}

export interface AgentConfig {
  url: string;
  token: string;
}

export type ProviderData = Record<string, any>;

export interface ProviderResult {
  status: "idle" | "loading" | "ok" | "error";
  data?: ProviderData;
  error?: string;
  updatedAt?: number;
  via?: string;
}

export const KIND_INFO: Record<ProviderKind, { title: string; blurb: string; keyLabel?: string; keyHint?: string; color: string }> = {
  openrouter: {
    title: "OpenRouter",
    blurb: "Credits spent today, this week and this month, plus what is left on the key.",
    keyLabel: "OpenRouter API key",
    keyHint: "Any normal key that starts with sk-or-. Read only, nothing is spent.",
    color: "#7c6cf2",
  },
  openai: {
    title: "OpenAI API",
    blurb: "Organization spend for the last 30 days and tokens for the last 7.",
    keyLabel: "OpenAI Admin key",
    keyHint: "Usage endpoints need an Admin key from an organization owner.",
    color: "#10a37f",
  },
  anthropic: {
    title: "Anthropic API",
    blurb: "Claude API spend and tokens by model for your organization.",
    keyLabel: "Anthropic Admin key",
    keyHint: "Needs an sk-ant-admin key. Calls go through the local agent.",
    color: "#d97757",
  },
  codex: {
    title: "Codex",
    blurb: "Your ChatGPT plan's 5-hour and weekly limits, read from Codex's own session logs.",
    color: "#3b82f6",
  },
  "claude-code": {
    title: "Claude Code",
    blurb: "Tokens in the current 5-hour block and per model, read from Claude Code's logs.",
    color: "#e0884f",
  },
  custom: {
    title: "Custom API",
    blurb: "Any provider with a JSON endpoint that reports usage or credits.",
    keyLabel: "API key",
    color: "#8b8b93",
  },
};

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: "codex", kind: "codex", name: "Codex", enabled: true, remember: true, budget: null },
  { id: "claude-code", kind: "claude-code", name: "Claude Code", enabled: true, remember: true, budget: null },
  { id: "openrouter", kind: "openrouter", name: "OpenRouter", enabled: true, remember: true, budget: null },
  { id: "openai", kind: "openai", name: "OpenAI API", enabled: true, remember: true, budget: null },
  { id: "anthropic", kind: "anthropic", name: "Anthropic API", enabled: true, remember: true, budget: null },
];

export const DEFAULT_AGENT: AgentConfig = { url: "http://127.0.0.1:4777", token: "" };

export function needsKey(kind: ProviderKind) {
  return kind === "openrouter" || kind === "openai" || kind === "anthropic" || kind === "custom";
}

export function isLocal(kind: ProviderKind) {
  return kind === "codex" || kind === "claude-code";
}

/* ------------------------------------------------------------------ */

class FriendlyError extends Error {}

async function getJson(url: string, init: RequestInit, who: string) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new FriendlyError(`Could not reach ${who}. Check your connection, or that the local agent is running.`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || body?.message || res.statusText;
    if (res.status === 401 || res.status === 403) {
      throw new FriendlyError(`${who} rejected the key (${res.status}). ${typeof msg === "string" ? msg : ""}`.trim());
    }
    throw new FriendlyError(`${who} returned ${res.status}. ${typeof msg === "string" ? msg : ""}`.trim());
  }
  return body;
}

async function openAIPages(path: string, params: Record<string, string>, key: string) {
  const merged: any = { data: [] };
  let page: string | null = null;
  for (let i = 0; i < 4; i++) {
    const qs = new URLSearchParams(params);
    if (page) qs.set("page", page);
    const json = await getJson(`https://api.openai.com${path}?${qs}`, { headers: { Authorization: `Bearer ${key}` } }, "OpenAI");
    merged.data.push(...(json?.data || []));
    if (!json?.has_more || !json?.next_page) break;
    page = json.next_page;
  }
  return merged;
}

async function anthropicPages(kind: "usage" | "cost", params: [string, string][], key: string, agent: AgentConfig) {
  const merged: any = { data: [] };
  let page: string | null = null;
  const useAgent = !!agent.token;
  for (let i = 0; i < 4; i++) {
    const qs = new URLSearchParams(params);
    if (page) qs.set("page", page);
    let url: string;
    const headers: Record<string, string> = { "X-Provider-Key": key };
    if (useAgent) {
      const path = kind === "usage" ? "usage_report/messages" : "cost_report";
      url = `${agent.url}/proxy/anthropic/v1/organizations/${path}?${qs}`;
      headers["X-NotchDeck-Token"] = agent.token;
    } else {
      qs.set("path", kind);
      url = `./api/anthropic?${qs}`;
    }
    const json = await getJson(url, { headers }, useAgent ? "Anthropic (via local agent)" : "Anthropic (via /api proxy)");
    merged.data.push(...(json?.data || []));
    if (!json?.has_more || !json?.next_page) break;
    page = json.next_page;
  }
  return merged;
}

async function fromAgent(path: string, agent: AgentConfig) {
  if (!agent.token) throw new FriendlyError("Connect the local agent first, or import the log folder.");
  const json = await getJson(`${agent.url}${path}?days=30`, { headers: { "X-NotchDeck-Token": agent.token } }, "the local agent");
  if (json && json.available === false) throw new FriendlyError(json.reason || "No logs found on this computer.");
  return json;
}

export async function fetchProvider(cfg: ProviderConfig, key: string, agent: AgentConfig): Promise<{ data: ProviderData; via: string }> {
  const now = Date.now();
  switch (cfg.kind) {
    case "openrouter": {
      if (!key) throw new FriendlyError("Add an OpenRouter key to start tracking.");
      const json = await getJson("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } }, "OpenRouter");
      return { data: normalizeOpenRouter(json), via: "openrouter.ai" };
    }
    case "openai": {
      if (!key) throw new FriendlyError("Add an OpenAI Admin key to start tracking.");
      const day = 86_400;
      const nowS = Math.floor(now / 1000);
      const [costs, usage] = await Promise.all([
        openAIPages("/v1/organization/costs", { start_time: String(nowS - 30 * day), bucket_width: "1d", limit: "31" }, key),
        openAIPages("/v1/organization/usage/completions", { start_time: String(nowS - 7 * day), bucket_width: "1d", limit: "7" }, key),
      ]);
      return { data: normalizeOpenAI(costs, usage, now), via: "api.openai.com" };
    }
    case "anthropic": {
      if (!key) throw new FriendlyError("Add an Anthropic Admin key to start tracking.");
      const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
      const [cost, usage] = await Promise.all([
        anthropicPages("cost", [["starting_at", iso(now - 30 * 86_400_000)], ["bucket_width", "1d"], ["limit", "31"]], key, agent),
        anthropicPages("usage", [["starting_at", iso(now - 7 * 86_400_000)], ["bucket_width", "1d"], ["limit", "7"], ["group_by[]", "model"]], key, agent),
      ]);
      return { data: normalizeAnthropic(cost, usage, now), via: agent.token ? "local agent" : "/api proxy" };
    }
    case "codex":
      return { data: await fromAgent("/local/codex", agent), via: "local agent" };
    case "claude-code":
      return { data: await fromAgent("/local/claude", agent), via: "local agent" };
    case "custom": {
      const c = cfg.custom;
      if (!c?.url) throw new FriendlyError("Add the usage endpoint URL.");
      const headers: Record<string, string> = {};
      if (key && c.authHeader) headers[c.authHeader] = `${c.authPrefix || ""}${key}`;
      const json = await getJson(c.url, { headers }, cfg.name || "the custom API");
      return { data: normalizeCustom(json, { ...c, name: cfg.name }), via: new URL(c.url).host };
    }
  }
}

/** Parse a folder the user picked in the browser. Nothing is uploaded. */
export async function parseImportedFolder(kind: "codex" | "claude-code", files: FileList | File[]) {
  const list = Array.from(files).filter((f) => f.name.endsWith(".jsonl"));
  if (!list.length) throw new FriendlyError("No .jsonl files in that folder. Pick ~/.codex/sessions or ~/.claude/projects.");
  const loaded = await Promise.all(
    list.map(async (f) => ({ name: (f as any).webkitRelativePath || f.name, text: await f.text() })),
  );
  const parsed = kind === "codex" ? parseCodexSessions(loaded) : parseClaudeCodeSessions(loaded);
  return { ...parsed, available: true, source: "folder-import", files: list.length };
}

/**
 * One number from 0 to 100 that says how close a provider is to its limit.
 * Codex uses its own reported limits; others use the key limit or your budget.
 */
export function pressure(cfg: ProviderConfig, d?: ProviderData): number | null {
  if (!d) return null;
  switch (cfg.kind) {
    case "codex": {
      const p = d.rateLimits?.primary?.usedPercent;
      const s = d.rateLimits?.secondary?.usedPercent;
      const vals = [p, s].filter((v) => typeof v === "number");
      return vals.length ? Math.max(...vals) : null;
    }
    case "claude-code":
      return budgetPercent(d.activeBlock?.tokens?.total ?? 0, cfg.budget);
    case "openrouter":
      if (d.limit) return budgetPercent(d.limit - (d.remaining ?? 0), d.limit);
      return budgetPercent(d.spentMonth, cfg.budget);
    case "openai":
    case "anthropic":
      return budgetPercent(d.spentMonth, cfg.budget);
    case "custom":
      if (d.limit) return budgetPercent(d.used, d.limit);
      return budgetPercent(d.used, cfg.budget);
  }
}

/** The percent a ring shows. For Codex this is the 5-hour window, matching the headline. */
export function displayPercent(cfg: ProviderConfig, d?: ProviderData): number | null {
  if (cfg.kind === "codex") return d?.rateLimits?.primary?.usedPercent ?? pressure(cfg, d);
  return pressure(cfg, d);
}

/** Realistic numbers so the notch panel can be previewed before anything is connected. */
export function sampleData(kind: ProviderKind, now = Date.now()): ProviderData {
  const hour = 3_600_000;
  switch (kind) {
    case "codex":
      return {
        totals: { total: 18_400_000, input: 16_900_000, output: 1_500_000 },
        rateLimits: {
          primary: { label: "5-hour", usedPercent: 42, resetsAt: now + 2.4 * hour },
          secondary: { label: "Weekly", usedPercent: 63, resetsAt: now + 3.2 * 24 * hour },
          planType: "plus",
        },
        byModel: { "gpt-5.5-codex": { total: 18_400_000 } },
        lastActivity: now - 6 * 60_000,
      };
    case "claude-code":
      return {
        totals: { total: 41_000_000, output: 380_000 },
        activeBlock: { start: now - 1.5 * hour, end: now + 3.5 * hour, tokens: { total: 6_200_000 }, messages: 214 },
        byModel: { "claude-sonnet-4-5": { total: 30_000_000 }, "claude-opus-4-5": { total: 11_000_000 } },
        lastActivity: now - 2 * 60_000,
      };
    case "openrouter":
      return { unit: "USD", spentToday: 0.84, spentWeek: 6.1, spentMonth: 14.37, spentTotal: 52.9, limit: 25, remaining: 10.63 };
    case "openai":
      return { unit: "USD", spentToday: 1.92, spentMonth: 38.4, tokens: { total: 9_100_000 } };
    case "anthropic":
      return { unit: "USD", spentToday: 2.45, spentMonth: 51.2, tokens: { total: 12_700_000 } };
    case "custom":
      return { unit: "USD", used: 3.5, limit: 10 };
  }
}
