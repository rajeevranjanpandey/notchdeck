# NotchDeck

[![Deploy to GitHub Pages](https://github.com/rajeevranjanpandey/notchdeck/actions/workflows/pages.yml/badge.svg)](https://github.com/rajeevranjanpandey/notchdeck/actions/workflows/pages.yml) [![Tests](https://img.shields.io/badge/tests-11%2F11%20passing-brightgreen)](tests)

## Problem

The notch on a MacBook is dead space. Meanwhile, if you use Codex, Claude Code, OpenRouter or paid AI APIs, it is easy to hit a limit or run up a bill without noticing. Every provider shows usage somewhere else, if it shows it at all.

link :https://notchdeck.pplx.app/#features

<img width="1779" height="994" alt="Screenshot 2026-10-23 at 12 06 23 AM" src="https://github.com/user-attachments/assets/915899db-cefd-4fc4-9430-09954da99594" />

## Solution

NotchDeck is an independent web rebuild of the notch panel idea from the Top Notch website, plus a new AI usage meter.

The notch opens into five live panels: Music, Weather, YouTube, Focus and AI Usage. The AI Usage panel and its dashboard track:

| Source | What you see | How it is read |
|---|---|---|
| Codex (ChatGPT plan) | 5-hour and weekly limit used, time until reset, tokens by model | The `rate_limits` snapshot OpenAI saves in `~/.codex/sessions/**/rollout-*.jsonl` |
| Claude Code | Tokens in the current 5-hour block, reset time, tokens by model and project | `~/.claude/projects/**/*.jsonl`, with duplicate streamed rows removed |
| OpenRouter | Spend today, this week, this month, and what is left on the key | `GET https://openrouter.ai/api/v1/key` with a normal key |
| OpenAI API | Organization spend for 30 days, tokens for 7 days | `/v1/organization/costs` and `/v1/organization/usage/completions` with an Admin key |
| Anthropic API | Spend and tokens by model | `/v1/organizations/cost_report` and `usage_report/messages` with an Admin key, through the local agent |
| Any other API | A used amount and an optional limit | Any GET JSON endpoint. You type the path, for example `data.usage` |

You can also set warning and alert levels, monthly budgets, auto refresh and desktop notifications.

## Implementation

```text
shared/usage-core.mjs        Parsers and math shared by the browser and the agent (pure, tested)
companion/notch-usage-agent.mjs  Local agent: reads logs, relays Anthropic, 127.0.0.1 only
api/anthropic.js             Optional Vercel function, if you host the site on Vercel
src/components/NotchDemo.tsx The notch and its open/close behavior
src/panels/*                 The five panels
src/components/UsageDashboard.tsx  Provider cards, alerts, charts
tests/                       Node tests with sample Codex and Claude Code logs
```

### Run it

```bash
npm install
npm run dev        # site on http://127.0.0.1:5173
npm test           # parser tests
npm run build      # also writes public/notch-usage-agent.mjs as one file
```

### Connect Codex and Claude Code

```bash
node companion/notch-usage-agent.mjs
# or the single file you can download from the site:
node notch-usage-agent.mjs --port 4777
```

The agent prints a pairing code. Paste it into the Local agent box on the page. It honors `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, only reads files changed in the last 30 days, and never writes to them.

If you would rather not run anything, use Import folder on the Codex or Claude Code card and pick `~/.codex/sessions` or `~/.claude/projects`. The files are read in the browser and never uploaded.

### Where keys live

Keys are saved in this browser's localStorage when Remember is ticked, or sessionStorage when it is not. OpenRouter and OpenAI are called straight from your browser. Anthropic goes through the local agent (or `api/anthropic.js` on Vercel) because its admin API rejects browser requests. Neither forwarder stores keys.

### Honest limits

- Codex numbers are as fresh as your last Codex turn. Using ChatGPT on the web or another machine does not update the local logs.
- Anthropic does not publish Claude subscription limits as numbers, so the Claude Code meter compares against a token budget you choose.
- OpenAI and Anthropic usage needs an Admin key from an organization owner. Normal project keys cannot read usage.
- A custom endpoint must allow browser requests (CORS). Otherwise, put it behind the agent.

Not affiliated with Top Notch, StartupStartup, Apple, OpenAI, Anthropic or OpenRouter. See `REVERSE-ENGINEERING.md` for how the original demo was studied.
