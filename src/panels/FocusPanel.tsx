import { useEffect, useState } from "react";
import { IconMinus, IconPause, IconPlay, IconPlus, IconReset } from "../components/Icons";

// Pomodoro-style timer: focus, short break, and a long break after four rounds.
const SESSIONS = 4;
const SHORT_BREAK = 5;
const LONG_BREAK = 15;

export function FocusPanel() {
  const [length, setLength] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [session, setSession] = useState(1);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  // When a phase ends, roll into the next one.
  useEffect(() => {
    if (left > 0) return;
    if (phase === "focus") {
      setPhase("break");
      setLeft((session % SESSIONS === 0 ? LONG_BREAK : SHORT_BREAK) * 60);
    } else {
      setPhase("focus");
      setSession((s) => (s % SESSIONS) + 1);
      setLeft(length * 60);
    }
  }, [left, phase, session, length]);

  const pick = (m: number) => {
    const v = Math.min(180, Math.max(1, m));
    setLength(v);
    setPhase("focus");
    setRunning(false);
    setLeft(v * 60);
  };

  const total = phase === "focus" ? length * 60 : (session % SESSIONS === 0 ? LONG_BREAK : SHORT_BREAK) * 60;
  const frac = total ? left / total : 0;
  const R = 112;
  const C = 2 * Math.PI * R;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="focus">
      <div className="focus-ring">
        <svg viewBox="0 0 260 260" width="260" height="260" aria-hidden="true">
          <circle cx="130" cy="130" r={R} className="ring-track" />
          <circle
            cx="130"
            cy="130"
            r={R}
            className={`ring-bar ${phase}`}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 130 130)"
          />
        </svg>
        <div className="focus-center">
          <span className="focus-time tabular" role="timer" aria-live="off">
            {mm}:{ss}
          </span>
          <span className="focus-phase">{phase === "focus" ? `Session ${session} of ${SESSIONS}` : "Break"}</span>
        </div>
      </div>
      <div className="focus-side">
        <div className="focus-row">
          {[25, 45, 60].map((m) => (
            <button key={m} type="button" className="preset" aria-pressed={length === m && phase === "focus"} onClick={() => pick(m)}>
              {m} min
            </button>
          ))}
        </div>
        <div className="focus-row">
          <button type="button" className="round" aria-label="One minute less" onClick={() => pick(length - 1)}>
            <IconMinus size={20} />
          </button>
          <span className="focus-len tabular">{length} min</span>
          <button type="button" className="round" aria-label="One minute more" onClick={() => pick(length + 1)}>
            <IconPlus size={20} />
          </button>
        </div>
        <div className="focus-row">
          <button type="button" className="btn-light btn-lg" onClick={() => setRunning((r) => !r)}>
            {running ? <IconPause size={18} /> : <IconPlay size={18} />} {running ? "Pause" : "Start"}
          </button>
          <button type="button" className="round" aria-label="Reset timer" onClick={() => pick(length)}>
            <IconReset size={20} />
          </button>
        </div>
        <p className="muted small">
          {SHORT_BREAK} minute breaks between sessions, {LONG_BREAK} after the fourth.
        </p>
      </div>
    </div>
  );
}
