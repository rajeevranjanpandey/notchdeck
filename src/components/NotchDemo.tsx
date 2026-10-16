// Interactive notch.
// The open/close rules match what the original site's demo does
// (recovered from its shipped bundle): it opens itself on the Music panel
// after 900 ms unless you touched it first, a click toggles between closed
// and the last panel, hovering a closed notch with a mouse opens it, and the
// shape morphs with a clip-path on an 800-unit grid.
// What is new here: the panels are live and interactive instead of
// screenshots, and there is a fifth panel for AI usage.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MusicPanel } from "../panels/MusicPanel";
import { WeatherPanel } from "../panels/WeatherPanel";
import { YouTubePanel } from "../panels/YouTubePanel";
import { FocusPanel } from "../panels/FocusPanel";
import { UsagePanel } from "../panels/UsagePanel";
import { IconChevronUp, IconGauge, IconMusic, IconTimer, IconVideo, IconWeather } from "./Icons";

export type PanelId = "music" | "weather" | "youtube" | "focus" | "usage";

const PANELS: Record<PanelId, { label: string; h: number; time: string; describe: string; Icon: typeof IconMusic }> = {
  music: { label: "Music", h: 522, time: "5:49 PM", Icon: IconMusic, describe: "Music panel: artwork, track title, playback controls and synced lyrics." },
  weather: { label: "Weather", h: 430, time: "5:49 PM", Icon: IconWeather, describe: "Weather panel: current conditions, today's high and low, the next hours and a seven-day forecast." },
  youtube: { label: "YouTube", h: 452, time: "5:48 PM", Icon: IconVideo, describe: "YouTube panel: paste a link to play it in the notch, with your last five videos." },
  focus: { label: "Focus", h: 430, time: "5:49 PM", Icon: IconTimer, describe: "Focus timer panel: a countdown ring, the session count and 25, 45 and 60 minute presets." },
  usage: { label: "AI Usage", h: 440, time: "5:50 PM", Icon: IconGauge, describe: "AI usage panel: Codex and Claude Code limits plus OpenRouter, OpenAI and Anthropic spend." },
};
const ORDER = Object.keys(PANELS) as PanelId[];
const ISLAND_W = 848;
const ISLAND_H = 546;

type State = "closed" | PanelId;

export function NotchDemo({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const [state, setState] = useState<State>("closed");
  const last = useRef<PanelId>("music");
  const touched = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.6);

  // Scale everything from the 800-unit design grid to the space we have.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.min(600, entry.contentRect.width - 28);
      setK(Math.max(0.3, w / 800));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      if (!touched.current) setState("music");
    }, reduce ? 0 : 900);
    return () => window.clearTimeout(t);
  }, []);

  const show = useCallback((p: PanelId) => {
    touched.current = true;
    last.current = p;
    setState(p);
  }, []);

  const toggle = useCallback(() => {
    touched.current = true;
    setState((s) => (s === "closed" ? last.current : "closed"));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "closed") {
        touched.current = true;
        setState("closed");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const closed = state === "closed";
  const u = (n: number) => `${(n * k).toFixed(2)}px`;
  const clip = closed
    ? `inset(0 ${u(234)} ${u(478)} ${u(234)} round 0 0 ${u(20)} ${u(20)})`
    : `inset(0 ${u(24)} ${u(ISLAND_H - PANELS[state].h)} ${u(24)} round ${u(30)})`;

  const time = closed ? "5:49 PM" : PANELS[state].time;

  return (
    <div className="screen-host" ref={hostRef}>
      <div className="screen" style={{ height: `calc(${u(ISLAND_H)} + clamp(28px, 5cqw, 52px))`, ["--k" as any]: k }}>
        <MenuBar time={time} k={k} />
        <div className="island-shadow">
          <div className={`island ${closed ? "is-closed" : "is-open"}`} style={{ width: u(ISLAND_W), height: u(ISLAND_H), clipPath: clip }}>
            {ORDER.map((id) => {
              const active = state === id;
              return (
                <div
                  key={id}
                  className="panel"
                  data-active={active}
                  aria-hidden={!active}
                  // inert keeps hidden panels out of the tab order
                  {...(!active ? { inert: "" as any } : {})}
                  style={{ width: 800, height: PANELS[id].h, transform: `scale(${k})`, left: u(24) }}
                >
                  <PanelChrome current={id} time={PANELS[id].time} onPick={show} onClose={toggle} />
                  <div className="panel-body">
                    {id === "music" && <MusicPanel active={active} />}
                    {id === "weather" && <WeatherPanel active={active} />}
                    {id === "youtube" && <YouTubePanel active={active} />}
                    {id === "focus" && <FocusPanel />}
                    {id === "usage" && <UsagePanel onOpenDashboard={onOpenDashboard} />}
                  </div>
                </div>
              );
            })}
            {closed && (
              <button
                type="button"
                className="notch-hit"
                aria-expanded={false}
                aria-controls="notch-desc"
                aria-label="Open the notch"
                onClick={toggle}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") show(last.current);
                }}
                style={{ left: u(234), width: u(ISLAND_W - 468), height: u(68) }}
              />
            )}
          </div>
        </div>
      </div>
      <p id="notch-desc" className="sr-only" aria-live="polite">
        {closed ? "The notch is closed." : PANELS[state].describe}
      </p>
      <div className="demo-controls">
        <div role="group" aria-label="Show a panel" className="chip-group">
          {ORDER.map((id) => (
            <button key={id} type="button" aria-pressed={state === id} onClick={() => show(id)} className={`chip ${id === "usage" ? "chip-new" : ""}`}>
              {PANELS[id].label}
            </button>
          ))}
        </div>
        <p className="demo-hint">Everything inside is live. Hover or tap the notch to open it, press the arrow or Esc to close it.</p>
      </div>
    </div>
  );
}

function MenuBar({ time, k }: { time: string; k: number }) {
  return (
    <div className="menubar" aria-hidden="true" style={{ height: 68 * k, fontSize: Math.max(10, 26 * k), paddingInline: 28 * k }}>
      <div className="menubar-side">
        <span className="menubar-logo">◆</span>
        <span className="menubar-strong">Finder</span>
        {["File", "Edit", "View", "Go", "Window"].map((m) => (
          <span key={m} className="menubar-extra">
            {m}
          </span>
        ))}
      </div>
      <div className="menubar-side">
        <span className="menubar-extra">Fri Oct 16</span>
        <span className="tabular">{time}</span>
      </div>
    </div>
  );
}

function PanelChrome({ current, time, onPick, onClose }: { current: PanelId; time: string; onPick: (p: PanelId) => void; onClose: () => void }) {
  return (
    <div className="chrome">
      <nav className="chrome-tabs" aria-label="Notch panels">
        {ORDER.map((id) => {
          const { Icon, label } = PANELS[id];
          return (
            <button key={id} type="button" className="chrome-tab" aria-current={current === id} aria-label={label} title={label} onClick={() => onPick(id)}>
              <Icon size={22} />
            </button>
          );
        })}
      </nav>
      <div className="chrome-right">
        <span className="tabular chrome-time">{time}</span>
        <button type="button" className="chrome-close" aria-label="Close the notch" aria-expanded={true} aria-controls="notch-desc" onClick={onClose}>
          <IconChevronUp size={20} />
        </button>
      </div>
    </div>
  );
}
