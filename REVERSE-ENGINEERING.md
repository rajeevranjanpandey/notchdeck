# How the Top Notch site was studied

## Problem

The goal was to rebuild what the Top Notch website shows (a notch that opens into panels for music, weather, YouTube and a focus timer) and add a new feature: tracking usage for Codex, Claude Code, OpenRouter and other API keys.

The real product is a paid Mac App Store binary. That binary was not available, so it was not inspected. Everything below comes from the public website at https://topnotch-hazel.vercel.app/ and its shipped JavaScript and CSS.

## What was inspected

| Item | Value |
|---|---|
| Target | https://topnotch-hazel.vercel.app/ (Vercel deployment `dpl_34qynnqyarRQsVr2ERY1QoKQhYze`) |
| Collected | `index.html` plus 11 `/_next/static/chunks` files, 816 KB, fetched 16 Oct 2026 |
| `index.html` SHA-256 | `58853506090d1fc3a1c67aa63a6423ebc29a0a8b99f99c5019a9c81117a7007f` |
| Notch demo chunk `0aenvi-fr5q45.js` SHA-256 | `f01ddbdaf447b11a82f961d8eac912aaafc36d7028cd32c6ec1f0ddda5b492b6` |
| Stylesheet `0f_zxt5jgj_e6.css` SHA-256 | `d15126731b489494fc42588e6c8186c69ed33b67eb64965f65d424ad58bff1cf` |
| Tool | REA `rea-agents@6.5.0`, `analyze-javascript-application`, Node 24.11.1 |
| REA Evidence ID | `ev_e311835c298a3411145dbd5635690d3eb4ae3733c54eb0b1c072dc624e077bee` |
| Root artifact SHA-256 | `eb8e5e53b29b5de6aeed39aee462bc11089996c5fa6723dcf307b1b2bc1759a2` |
| Demo module node | `jag_node_cc76850a21d31d08872194c026227062956d64d2748aa2429c90c9102c344325` |

REA read 10 JavaScript files (about 200,000 syntax nodes) as inert text and never ran them. Its stated limits: two large framework chunks went over the result budget (their static facts were kept), and 25 inline scripts in `index.html` were not analyzed. Neither affects the notch demo, which sits in its own small chunk.

## What was recovered (provenance: observed behavior plus shipped source)

From the demo chunk, formatted for reading:

1. State is `"closed"` or one of `music`, `weather`, `youtube`, `focus`.
2. After 900 ms the demo opens on Music, unless you already interacted. With reduced motion turned on the delay is 0.
3. Clicking the notch toggles between closed and the last panel you picked.
4. Moving a mouse (not touch) over a closed notch opens the last panel.
5. Panel chips use `aria-pressed`. A hidden `aria-live` line reads "The notch is closed." or a description of the panel.
6. The shape is drawn on an 800-unit grid. The island is 848 by 546 units. Closed, the clip is `inset(0 234 478 234 round 0 0 20 20)`. Open, it is `inset(0 24 (546 minus panel height) 24 round 30)`.
7. The clip-path animates over 0.64 s using a spring curve written as a CSS `linear()` function. Panel images fade in after a 0.12 s delay.

From the stylesheet: the light and dark color tokens and the spring curve. The colors were reused as a starting point. No images, wallpaper, logo or copy were reused.

## Comparison test

`scripts/compare-notch.mjs` (run it with the preview server on port 4173) runs the same steps in a real browser against the original site and the rebuild, then reads the state from the accessibility attributes.

| Step | Original | Rebuild |
|---|---|---|
| Page load | closed | closed |
| After 1.6 s | music | music |
| Click close | closed | closed |
| Click open | music | music |
| Click Weather chip | weather (pressed) | weather (pressed) |
| Close, then open again | weather | weather |
| Click Focus before 900 ms, then wait | focus stays | focus stays |
| Mouse over a closed notch | opens last panel | opens last panel |
| Reduced motion, right after load | music | music |

All 9 steps (10 checks) matched.

## What is new, and is not from the target

| Area | What changed |
|---|---|
| Panels | Live and interactive instead of screenshots: a demo music player with synced lyrics, real weather from Open-Meteo, a working YouTube embed with recent videos, and a working focus timer. |
| Closing | Since the panels have their own buttons, you close with the arrow button or Esc. The original closes with a click anywhere on the screenshot. |
| AI Usage panel | A fifth panel, plus a full dashboard, for Codex, Claude Code, OpenRouter, OpenAI, Anthropic and custom APIs. |
| Size | The demo grows to 600 px wide (the original stops at 400 px) so live panels stay readable. |

## Ledger

| Behavior | Evidence | Where in the code | Test | Status |
|---|---|---|---|---|
| Notch state machine | REA Evidence above, demo chunk | `src/components/NotchDemo.tsx` | 10 checks against the original | Verified |
| Clip-path geometry and spring | Demo chunk and stylesheet | `NotchDemo.tsx`, `src/index.css` | Visual check at 1280 px and 375 px | Matches by design, not pixel-tested |
| Codex limits from rollout logs | Public docs and issue reports | `shared/usage-core.mjs` | Unit tests with fixtures, agent run | Verified on sample logs, not on your real logs |
| Claude Code 5-hour blocks | Public log format | `shared/usage-core.mjs` | Unit tests | Verified on sample logs |
| OpenRouter, OpenAI, Anthropic | Official API docs | `src/lib/providers.ts` | Live calls with fake keys return clean 401 messages | The real-key path is unit-tested only |
