import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCodexSessions, parseClaudeCodeSessions, normalizeOpenRouter, normalizeOpenAI,
  normalizeAnthropic, normalizeCustom, budgetPercent, alertLevel, windowLabel, formatTokens,
} from "../shared/usage-core.mjs";

const fx = (n) => ({ name: `projects/-Users-me-app/${n}`, text: readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8") });
const NOW = Date.parse("2026-10-16T17:00:00.000Z");

test("codex sums per-turn usage, never the running total twice", () => {
  const r = parseCodexSessions([fx("codex-rollout.jsonl")], NOW);
  assert.equal(r.totals.input, 3000);
  assert.equal(r.totals.output, 400);
  assert.equal(r.totals.total, 3400);
  assert.equal(r.turns, 2);
  assert.equal(r.byModel["gpt-5.5-codex"].total, 3400);
});

test("codex keeps the newest rate-limit snapshot", () => {
  const r = parseCodexSessions([fx("codex-rollout.jsonl")], NOW);
  assert.equal(r.rateLimits.primary.usedPercent, 18.5);
  assert.equal(r.rateLimits.primary.label, "5-hour");
  assert.equal(r.rateLimits.secondary.label, "Weekly");
  assert.equal(r.rateLimits.primary.resetsAt, 1792000000 * 1000);
  assert.equal(r.rateLimits.planType, "plus");
});

test("codex falls back to the final total and relative reset times", () => {
  const r = parseCodexSessions([fx("codex-old.jsonl")], NOW);
  assert.equal(r.totals.total, 990);
  assert.equal(r.rateLimits.primary.usedPercent, 50);
  assert.equal(r.rateLimits.primary.resetsAt, Date.parse("2026-10-15T10:10:00.000Z") + 600_000);
  assert.equal(r.rateLimits.secondary, null);
});

test("codex across two files picks the newest limits by time", () => {
  const r = parseCodexSessions([fx("codex-rollout.jsonl"), fx("codex-old.jsonl")], NOW);
  assert.equal(r.sessions, 2);
  assert.equal(r.totals.total, 3400 + 990);
  assert.equal(r.rateLimits.primary.usedPercent, 18.5);
});

test("claude code de-duplicates streamed rows and skips synthetic ones", () => {
  const r = parseClaudeCodeSessions([fx("claude-session.jsonl")], NOW);
  assert.equal(r.turns, 3);
  assert.equal(r.totals.output, 1050);
  assert.equal(r.totals.cacheWrite, 2000);
  assert.equal(r.totals.cachedInput, 2000);
  assert.equal(r.byModel["claude-opus-4-5"].output, 700);
  assert.ok(!r.byModel["<synthetic>"]);
  assert.ok(r.byProject["Users-me-app"]);
  assert.equal(r.sessions, 2);
});

test("claude code builds five-hour blocks from the first message hour", () => {
  const r = parseClaudeCodeSessions([fx("claude-session.jsonl")], NOW);
  assert.equal(r.recentBlocks.length, 2);
  assert.equal(r.recentBlocks[0].start, Date.parse("2026-10-16T09:00:00.000Z"));
  assert.equal(r.recentBlocks[0].messages, 2);
  assert.equal(r.activeBlock.start, Date.parse("2026-10-16T16:00:00.000Z"));
  assert.equal(r.activeBlock.tokens.total, 150);
  const later = parseClaudeCodeSessions([fx("claude-session.jsonl")], Date.parse("2026-10-16T22:00:00.000Z"));
  assert.equal(later.activeBlock, null);
});

test("openrouter key response", () => {
  const r = normalizeOpenRouter({ data: { label: "sk-or-v1-abc", usage: 12.5, usage_daily: 0.4, usage_weekly: 3, usage_monthly: 9, limit: 20, limit_remaining: 7.5, is_free_tier: false } });
  assert.equal(r.spentTotal, 12.5);
  assert.equal(r.remaining, 7.5);
  assert.equal(r.limit, 20);
  const unlimited = normalizeOpenRouter({ data: { usage: 1, limit: null, limit_remaining: null } });
  assert.equal(unlimited.limit, null);
});

test("openai costs and usage buckets", () => {
  const start = Math.floor(NOW / 1000) - 3600;
  const r = normalizeOpenAI(
    { data: [{ start_time: start, results: [{ amount: { value: 0.06, currency: "usd" } }, { amount: { value: 1.2 } }] }] },
    { data: [{ start_time: start, results: [{ input_tokens: 1000, output_tokens: 500, input_cached_tokens: 800, num_model_requests: 5 }] }] },
    NOW,
  );
  assert.ok(Math.abs(r.spentToday - 1.26) < 1e-9);
  assert.equal(r.tokens.total, 1500);
  assert.equal(r.requests, 5);
});

test("anthropic cost amounts are cents", () => {
  const r = normalizeAnthropic(
    { data: [{ starting_at: "2026-10-16T00:00:00Z", results: [{ amount: "250.5", currency: "USD" }] }] },
    { data: [{ starting_at: "2026-10-16T00:00:00Z", results: [{ model: "claude-sonnet-4-5", uncached_input_tokens: 10, cache_read_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 3, ephemeral_1h_input_tokens: 2 }, output_tokens: 20 }] }] },
    NOW,
  );
  assert.ok(Math.abs(r.spentMonth - 2.505) < 1e-9);
  assert.equal(r.tokens.total, 40);
  assert.equal(r.byModel["claude-sonnet-4-5"].cacheWrite, 5);
});

test("custom endpoint paths", () => {
  const r = normalizeCustom({ credits: [{ used: "4.2", cap: 10 }] }, { name: "Groq", usedPath: "credits[0].used", limitPath: "credits[0].cap" });
  assert.equal(r.used, 4.2);
  assert.equal(r.limit, 10);
  assert.throws(() => normalizeCustom({}, { usedPath: "nope" }), /Could not find/);
});

test("budget helpers and labels", () => {
  assert.equal(budgetPercent(5, 10), 50);
  assert.equal(budgetPercent(50, 10), 100);
  assert.equal(budgetPercent(5, 0), null);
  assert.equal(alertLevel(80), "warning");
  assert.equal(alertLevel(95), "critical");
  assert.equal(alertLevel(10), "ok");
  assert.equal(windowLabel(43200), "30-day");
  assert.equal(formatTokens(1_234_567), "1.2M");
});
