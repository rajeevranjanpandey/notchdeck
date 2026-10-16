// The new notch panel: one glance at how much AI you have left.
import { useEffect, useState } from "react";
import { useUsage } from "../lib/usageStore";
import { KIND_INFO, displayPercent, pressure, sampleData, type ProviderConfig } from "../lib/providers";
import { alertLevel, formatCountdown, formatMoney, formatTokens } from "../../shared/usage-core.mjs";
import { IconRefresh } from "../components/Icons";

export function Ring({ pct, color, size = 96, label }: { pct: number | null; color: string; size?: number; label?: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || (pct == null ? "No limit set" : `${Math.round(v)} percent used`)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={8} />
      {pct != null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      )}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="currentColor" fontSize={size * 0.22} fontWeight={600}>
        {pct == null ? "–" : `${Math.round(v)}%`}
      </text>
    </svg>
  );
}

/** Headline + detail lines for a provider, used by the notch and dashboard. */
export function summarize(cfg: ProviderConfig, d: any, now = Date.now()) {
  switch (cfg.kind) {
    case "codex": {
      const p = d?.rateLimits?.primary;
      const s = d?.rateLimits?.secondary;
      return {
        headline: p ? `${Math.round(100 - p.usedPercent)}% left` : formatTokens(d?.totals?.total),
        sub: p ? `${p.label} resets in ${formatCountdown(p.resetsAt ? p.resetsAt - now : null)}` : "tokens in 30 days",
        extra: s ? `${s.label}: ${Math.round(100 - s.usedPercent)}% left` : d?.rateLimits ? "" : "No plan limits in the logs yet",
      };
    }
    case "claude-code": {
      const b = d?.activeBlock;
      return {
        headline: b ? formatTokens(b.tokens.total) : "Idle",
        sub: b ? `this block · resets in ${formatCountdown(b.end - now)}` : "no active 5-hour block",
        extra: `${formatTokens(d?.totals?.total)} tokens in 30 days`,
      };
    }
    case "openrouter":
      return {
        headline: d?.limit != null ? `${formatMoney(d.remaining)} left` : formatMoney(d?.spentMonth),
        sub: d?.limit != null ? `of ${formatMoney(d.limit)} key limit` : "spent this month",
        extra: `Today ${formatMoney(d?.spentToday)} · week ${formatMoney(d?.spentWeek)}`,
      };
    case "openai":
    case "anthropic":
      return {
        headline: formatMoney(d?.spentMonth),
        sub: cfg.budget ? `of ${formatMoney(cfg.budget)} budget this month` : "spent this month",
        extra: `Today ${formatMoney(d?.spentToday)} · ${formatTokens(d?.tokens?.total)} tokens in 7 days`,
      };
    case "custom":
      return {
        headline: formatMoney(d?.used, d?.unit),
        sub: d?.limit != null ? `of ${formatMoney(d.limit, d.unit)}` : "used",
        extra: "",
      };
  }
}

const tone = (level: string, base: string) => (level === "critical" ? "#ff5f57" : level === "warning" ? "#febc2e" : base);

export function UsagePanel({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const { providers, results, refreshAll, connectedCount } = useUsage();
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNow((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const sample = connectedCount === 0;
  const shown = providers.filter((p) => p.enabled && (sample || results[p.id]?.status === "ok")).slice(0, 5);
  const loading = providers.some((p) => results[p.id]?.status === "loading");

  return (
    <div className="usage-panel">
      <div className="usage-head">
        <div>
          <h3>AI usage</h3>
          <p className="muted">{sample ? "Sample numbers. Connect your tools below the demo to see your own." : `${connectedCount} source${connectedCount === 1 ? "" : "s"} connected`}</p>
        </div>
        <div className="usage-head-actions">
          {sample && <span className="badge">Sample</span>}
          <button type="button" className="round" aria-label="Refresh usage" onClick={() => void refreshAll()} disabled={loading}>
            <IconRefresh size={18} className={loading ? "spin" : ""} />
          </button>
          <button type="button" className="btn-light" onClick={onOpenDashboard}>
            Open dashboard
          </button>
        </div>
      </div>
      <div className="usage-grid" data-count={shown.length} data-odd={shown.length % 2 === 1 && shown.length >= 3}>
        {shown.map((p, idx) => {
          const compact = shown.length >= 3 && shown.length % 2 === 1 && idx >= shown.length - 3;
          const d = sample ? sampleData(p.kind) : results[p.id]?.data;
          const view = sample ? { ...p, budget: p.budget ?? (p.kind === "claude-code" ? 10_000_000 : p.kind === "openai" || p.kind === "anthropic" ? 100 : null) } : p;
          const pct = displayPercent(view, d);
          const info = KIND_INFO[p.kind];
          const s = summarize(p, d);
          const level = alertLevel(pressure(view, d));
          return (
            <div key={p.id} className={`usage-tile level-${level}`}>
              {!compact && <Ring pct={pct} color={tone(level, info.color)} size={76} />}
              <div className="usage-tile-text">
                <span className="usage-name">
                  <i style={{ background: info.color }} />
                  {p.name}
                </span>
                <strong className="tabular">{s.headline}</strong>
                <span className="muted">{s.sub}</span>
                {s.extra && !compact && <span className="muted small">{s.extra}</span>}
              </div>
              {compact && (
                <div className="mini-meter" role="img" aria-label={pct == null ? "No limit set" : `${Math.round(pct)} percent used`}>
                  <span style={{ width: `${pct ?? 0}%`, background: tone(level, info.color) }} />
                  <em className="tabular">{pct == null ? "no limit" : `${Math.round(pct)}%`}</em>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
