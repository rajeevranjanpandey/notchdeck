import { useRef, useState } from "react";
import { useUsage } from "../lib/usageStore";
import { KIND_INFO, displayPercent, isLocal, needsKey, pressure, type ProviderConfig } from "../lib/providers";
import { alertLevel, formatMoney, formatTokens, lastDays } from "../../shared/usage-core.mjs";
import { Ring, summarize } from "../panels/UsagePanel";
import { IconBell, IconFolder, IconPlus, IconRefresh, IconTerminal, IconTrash } from "./Icons";

const ago = (t?: number) => {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};

export function UsageDashboard() {
  const u = useUsage();
  const anyLoading = u.providers.some((p) => u.results[p.id]?.status === "loading");

  return (
    <div className="dash">
      <div className="dash-toolbar">
        <button type="button" className="btn-primary" onClick={() => void u.refreshAll()} disabled={anyLoading}>
          <IconRefresh size={16} className={anyLoading ? "spin" : ""} /> {anyLoading ? "Refreshing" : "Refresh all"}
        </button>
        <label className="field-inline">
          Auto refresh
          <select value={u.settings.autoRefreshMin} onChange={(e) => u.setSettings({ autoRefreshMin: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={1}>Every minute</option>
            <option value={5}>Every 5 minutes</option>
            <option value={15}>Every 15 minutes</option>
          </select>
        </label>
        <label className="field-inline">
          Warn at
          <input type="number" min={10} max={99} value={u.settings.warnAt} onChange={(e) => u.setSettings({ warnAt: Number(e.target.value) })} />%
        </label>
        <label className="field-inline">
          Alert at
          <input type="number" min={10} max={100} value={u.settings.critAt} onChange={(e) => u.setSettings({ critAt: Number(e.target.value) })} />%
        </label>
        <button
          type="button"
          className="btn-secondary"
          aria-pressed={u.settings.notify}
          onClick={async () => {
            if (u.settings.notify) return u.setSettings({ notify: false });
            let ok = false;
            try {
              ok = "Notification" in window && (await Notification.requestPermission()) === "granted";
            } catch {
              ok = false;
            }
            u.setSettings({ notify: ok });
          }}
        >
          <IconBell size={16} /> {u.settings.notify ? "Desktop alerts on" : "Desktop alerts off"}
        </button>
      </div>

      <Totals />
      <AgentCard />

      <div className="cards">
        {u.providers.map((p) => (
          <ProviderCard key={p.id} cfg={p} />
        ))}
        <button type="button" className="card card-add" onClick={() => u.addCustom()}>
          <IconPlus size={22} />
          <span>Add another API</span>
          <span className="muted small">Groq, Together, DeepSeek, Mistral or anything with a JSON usage endpoint</span>
        </button>
      </div>

      <Charts />

      <div className="toasts" aria-live="polite">
        {u.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => u.dismissToast(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Totals() {
  const { providers, results } = useUsage();
  let month = 0;
  let today = 0;
  let tokens = 0;
  let money = 0;
  for (const p of providers) {
    const d = results[p.id]?.status === "ok" ? results[p.id]?.data : null;
    if (!d) continue;
    if (p.kind === "openai" || p.kind === "anthropic" || p.kind === "openrouter") {
      money++;
      month += d.spentMonth || 0;
      today += d.spentToday || 0;
    }
    if (isLocal(p.kind)) tokens += d.totals?.total || 0;
  }
  const codex = providers.find((p) => p.kind === "codex");
  const codexData = codex ? results[codex.id]?.data : null;
  const prim = codexData?.rateLimits?.primary;
  return (
    <div className="totals">
      <div className="total">
        <span className="total-label">API spend this month</span>
        <strong className="tabular">{money ? formatMoney(month) : "–"}</strong>
        <span className="muted small">{money ? `${money} paid API${money > 1 ? "s" : ""} · ${formatMoney(today)} today` : "Connect OpenRouter, OpenAI or Anthropic"}</span>
      </div>
      <div className="total">
        <span className="total-label">Coding agent tokens, 30 days</span>
        <strong className="tabular">{tokens ? formatTokens(tokens) : "–"}</strong>
        <span className="muted small">Codex and Claude Code combined</span>
      </div>
      <div className="total">
        <span className="total-label">Codex 5-hour window</span>
        <strong className="tabular">{prim ? `${Math.round(100 - prim.usedPercent)}% left` : "–"}</strong>
        <span className="muted small">{prim ? "As reported by OpenAI in your last Codex turn" : "Appears after the agent reads your Codex logs"}</span>
      </div>
    </div>
  );
}

function AgentCard() {
  const { agent, setAgent, agentStatus, checkAgent, refreshAll } = useUsage();
  const [code, setCode] = useState(agent.token);
  const [url, setUrl] = useState(agent.url);
  const connect = async () => {
    setAgent({ token: code.trim(), url: url.trim().replace(/\/$/, "") });
    // let state settle before the check reads it
    await new Promise((r) => setTimeout(r, 0));
    if (await checkAgent()) void refreshAll();
  };
  return (
    <div className="agent">
      <div className="agent-text">
        <h3>
          <IconTerminal size={20} /> Local agent
          <span className={`status status-${agentStatus}`}>{agentStatus === "online" ? "Connected" : agentStatus === "checking" ? "Checking" : agentStatus === "offline" && agent.token ? "Not reachable" : "Not connected"}</span>
        </h3>
        <p>
          Codex and Claude Code keep their usage in log files on your computer, and Anthropic's admin API refuses browser requests. A small script reads those files and
          relays Anthropic calls, so nothing goes to a server you do not control. It needs Node 18 or newer and has no dependencies.
        </p>
        <pre className="code">
          <code>{`curl -O ${location.origin}${location.pathname.replace(/[^/]*$/, "")}notch-usage-agent.mjs\nnode notch-usage-agent.mjs`}</code>
        </pre>
        <p className="muted small">
          It prints a pairing code. Paste it here. The agent only listens on 127.0.0.1 and rejects any request without that code. Prefer not to run anything? Use
          “Import folder” on the Codex or Claude Code card instead.
        </p>
      </div>
      <form
        className="agent-form"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <label className="field">
          <span>Agent address</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        </label>
        <label className="field">
          <span>Pairing code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="from the agent window" spellCheck={false} autoComplete="off" />
        </label>
        <button type="submit" className="btn-primary">
          Connect
        </button>
      </form>
    </div>
  );
}

function ProviderCard({ cfg }: { cfg: ProviderConfig }) {
  const u = useUsage();
  const r = u.results[cfg.id];
  const info = KIND_INFO[cfg.kind];
  const [open, setOpen] = useState(cfg.kind === "custom" && !cfg.custom?.url);
  const [reveal, setReveal] = useState(false);
  const folder = useRef<HTMLInputElement>(null);
  const d = r?.data;
  const pct = displayPercent(cfg, d);
  const level = alertLevel(pressure(cfg, d), u.settings.warnAt, u.settings.critAt);
  const s = d ? summarize(cfg, d) : null;
  const statusText = r?.status === "loading" ? "Updating" : r?.status === "error" ? "Needs attention" : r?.status === "ok" ? `Updated ${ago(r.updatedAt)}` : "Not set up";

  return (
    <article className={`card level-${d ? level : "none"}`} aria-labelledby={`h-${cfg.id}`}>
      <header className="card-head">
        <span className="dot" style={{ background: info.color }} />
        <h3 id={`h-${cfg.id}`}>{cfg.name}</h3>
        <span className={`status status-${r?.status || "idle"}`}>{statusText}</span>
      </header>

      {d && s ? (
        <div className="card-body">
          <Ring pct={pct} color={level === "critical" ? "var(--crit)" : level === "warning" ? "var(--warn)" : info.color} size={92} />
          <div className="card-metrics">
            <strong className="tabular">{s.headline}</strong>
            <span>{s.sub}</span>
            {s.extra && <span className="muted small">{s.extra}</span>}
            <span className="muted small">Source: {r?.via || d.source}</span>
          </div>
        </div>
      ) : (
        <p className="card-blurb">{info.blurb}</p>
      )}
      {d && <Detail cfg={cfg} d={d} />}

      {r?.status === "error" && <p className="card-error">{r.error}</p>}

      <div className="card-actions">
        <button type="button" className="btn-secondary" onClick={() => void u.refresh(cfg.id, true)} disabled={r?.status === "loading"}>
          <IconRefresh size={15} className={r?.status === "loading" ? "spin" : ""} /> Refresh
        </button>
        {isLocal(cfg.kind) && (
          <>
            <button type="button" className="btn-secondary" onClick={() => folder.current?.click()}>
              <IconFolder size={15} /> Import folder
            </button>
            <input
              ref={folder}
              type="file"
              hidden
              multiple
              {...({ webkitdirectory: "", directory: "" } as any)}
              onChange={(e) => {
                if (e.target.files?.length) void u.importFolder(cfg.id, e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
        <button type="button" className="btn-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide settings" : d ? "Settings" : "Set up"}
        </button>
      </div>

      {open && (
        <div className="card-settings">
          {cfg.kind === "custom" && <CustomFields cfg={cfg} />}
          {needsKey(cfg.kind) && (
            <label className="field">
              <span>{info.keyLabel}</span>
              <div className="key-row">
                <input
                  type={reveal ? "text" : "password"}
                  value={u.keys[cfg.id] || ""}
                  onChange={(e) => u.setKey(cfg.id, e.target.value)}
                  placeholder="Paste key"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className="btn-link" onClick={() => setReveal((v) => !v)}>
                  {reveal ? "Hide" : "Show"}
                </button>
              </div>
              {info.keyHint && <small className="muted">{info.keyHint}</small>}
            </label>
          )}
          {needsKey(cfg.kind) && (
            <label className="check">
              <input type="checkbox" checked={cfg.remember} onChange={(e) => u.updateProvider(cfg.id, { remember: e.target.checked })} />
              Remember this key in this browser (otherwise it is forgotten when the tab closes)
            </label>
          )}
          {cfg.kind === "codex" && (
            <p className="muted small">
              Codex has no public usage API for ChatGPT plans. The 5-hour and weekly numbers come from the rate-limit snapshot OpenAI sends with every Codex reply, saved in
              ~/.codex/sessions. They refresh the next time you use Codex.
            </p>
          )}
          {cfg.kind === "claude-code" && (
            <p className="muted small">
              Reads ~/.claude/projects. Anthropic does not publish plan limits as numbers, so set your own token budget per 5-hour block to get a meter and alerts.
            </p>
          )}
          {cfg.kind !== "codex" && (
            <label className="field">
              <span>{cfg.kind === "claude-code" ? "Token budget per 5-hour block" : cfg.kind === "openrouter" ? "Monthly budget in USD (used when the key has no limit)" : "Monthly budget"}</span>
              <input
                type="number"
                min={0}
                step={cfg.kind === "claude-code" ? 100000 : 1}
                value={cfg.budget ?? ""}
                placeholder={cfg.kind === "claude-code" ? "for example 8000000" : "for example 50"}
                onChange={(e) => u.updateProvider(cfg.id, { budget: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
          )}
          <div className="settings-foot">
            <button type="button" className="btn-primary" onClick={() => void u.refresh(cfg.id, true)}>
              Save and check
            </button>
            {cfg.kind === "custom" && (
              <button type="button" className="btn-link danger" onClick={() => u.removeProvider(cfg.id)}>
                <IconTrash size={14} /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Detail({ cfg, d }: { cfg: ProviderConfig; d: any }) {
  const models: [string, any][] = Object.entries(d.byModel || {});
  if (cfg.kind === "codex" && d.rateLimits) {
    const rows = [d.rateLimits.primary, d.rateLimits.secondary].filter(Boolean);
    return (
      <div className="bars">
        {rows.map((w: any) => (
          <Bar key={w.label} label={w.label} pct={w.usedPercent} right={`${Math.round(w.usedPercent)}% used`} />
        ))}
        {d.rateLimits.planType && <span className="muted small">Plan: {d.rateLimits.planType}</span>}
      </div>
    );
  }
  if (!models.length) return null;
  const top = models.sort((a, b) => (b[1].total || 0) - (a[1].total || 0)).slice(0, 3);
  const max = top[0][1].total || 1;
  return (
    <div className="bars">
      {top.map(([m, t]) => (
        <Bar key={m} label={m} pct={((t.total || 0) / max) * 100} right={formatTokens(t.total)} />
      ))}
    </div>
  );
}

function Bar({ label, pct, right }: { label: string; pct: number; right: string }) {
  return (
    <div className="bar">
      <span className="bar-label" title={label}>
        {label}
      </span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </span>
      <span className="bar-right tabular">{right}</span>
    </div>
  );
}

function CustomFields({ cfg }: { cfg: ProviderConfig }) {
  const { updateProvider } = useUsage();
  const c = cfg.custom!;
  const set = (patch: Partial<typeof c>) => updateProvider(cfg.id, { custom: { ...c, ...patch } });
  return (
    <div className="custom-grid">
      <label className="field">
        <span>Name</span>
        <input value={cfg.name} onChange={(e) => updateProvider(cfg.id, { name: e.target.value })} />
      </label>
      <label className="field span-2">
        <span>Usage endpoint (GET, must allow browser requests)</span>
        <input value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.example.com/v1/usage" spellCheck={false} />
      </label>
      <label className="field">
        <span>Auth header</span>
        <input value={c.authHeader} onChange={(e) => set({ authHeader: e.target.value })} spellCheck={false} />
      </label>
      <label className="field">
        <span>Value prefix</span>
        <input value={c.authPrefix} onChange={(e) => set({ authPrefix: e.target.value })} spellCheck={false} />
      </label>
      <label className="field">
        <span>Path to amount used</span>
        <input value={c.usedPath} onChange={(e) => set({ usedPath: e.target.value })} placeholder="data.usage" spellCheck={false} />
      </label>
      <label className="field">
        <span>Path to limit (optional)</span>
        <input value={c.limitPath} onChange={(e) => set({ limitPath: e.target.value })} placeholder="data.limit" spellCheck={false} />
      </label>
      <label className="field">
        <span>Unit</span>
        <input value={c.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="USD, credits, tokens" />
      </label>
    </div>
  );
}

function Charts() {
  const { providers, results } = useUsage();
  const days = lastDays(14);
  const tokenSeries = providers
    .filter((p) => isLocal(p.kind) && results[p.id]?.data?.byDay)
    .map((p) => ({ name: p.name, color: KIND_INFO[p.kind].color, values: days.map((k) => results[p.id]!.data!.byDay[k]?.total || 0) }));
  const spendSeries = providers
    .filter((p) => (p.kind === "openai" || p.kind === "anthropic") && results[p.id]?.data?.dailySpend)
    .map((p) => ({ name: p.name, color: KIND_INFO[p.kind].color, values: days.map((k) => results[p.id]!.data!.dailySpend[k] || 0) }));
  if (!tokenSeries.length && !spendSeries.length) return null;
  return (
    <div className="charts">
      {tokenSeries.length > 0 && <Stacked title="Coding agent tokens per day" days={days} series={tokenSeries} fmt={formatTokens} />}
      {spendSeries.length > 0 && <Stacked title="API spend per day" days={days} series={spendSeries} fmt={(n: number) => formatMoney(n)} />}
    </div>
  );
}

function Stacked({ title, days, series, fmt }: { title: string; days: string[]; series: { name: string; color: string; values: number[] }[]; fmt: (n: number) => string }) {
  const totals = days.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(1, ...totals);
  const W = 560;
  const H = 180;
  const bw = W / days.length;
  return (
    <figure className="chart">
      <figcaption>
        {title}
        <span className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`${title}, last 14 days. Highest day ${fmt(max)}.`}>
        {days.map((d, i) => {
          let y = H;
          return (
            <g key={d}>
              <title>{`${d}: ${fmt(totals[i])}`}</title>
              {series.map((s) => {
                const h = (s.values[i] / max) * (H - 8);
                y -= h;
                return <rect key={s.name} x={i * bw + 4} y={y} width={bw - 8} height={Math.max(0, h)} rx={3} fill={s.color} />;
              })}
              {(i % 2 === 1 || i === days.length - 1) && (
                <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.6}>
                  {d.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
