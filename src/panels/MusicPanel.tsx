import { useEffect, useRef, useState } from "react";
import { IconLyrics, IconNext, IconPause, IconPlay, IconPrev, IconRepeat } from "../components/Icons";

// Made-up demo tracks. Artwork is drawn with CSS so no images are borrowed.
const TRACKS = [
  {
    title: "Paper Lanterns",
    artist: "Mira Okafor",
    duration: 196,
    art: "linear-gradient(135deg,#f7b267 0%,#f25f5c 55%,#5b2a86 100%)",
    lyrics: [
      [0, "Lights go up along the water"],
      [7, "Every window holds a spark"],
      [14, "We wrote our names in paper lanterns"],
      [22, "Let them drift into the dark"],
      [30, "Hold the string a little longer"],
      [38, "Count the seconds, not the miles"],
      [46, "Paper lanterns, paper lanterns"],
      [54, "Burning softly for a while"],
    ] as [number, string][],
  },
  {
    title: "Night Shift Static",
    artist: "The Low Hum",
    duration: 221,
    art: "linear-gradient(160deg,#0f2027 0%,#2c5364 60%,#7ee8fa 100%)",
    lyrics: [
      [0, "Radio is humming on the dashboard"],
      [8, "City sleeping under sodium light"],
      [16, "I keep the signal close and steady"],
      [24, "Night shift static, holding tight"],
      [32, "Every exit looks the same tonight"],
    ] as [number, string][],
  },
  {
    title: "Small Hours",
    artist: "Juniper & Vale",
    duration: 178,
    art: "linear-gradient(200deg,#a8e063 0%,#56ab2f 50%,#1d3b1a 100%)",
    lyrics: [
      [0, "Kettle on and the floor is cold"],
      [6, "Pages turning, nothing told"],
      [12, "In the small hours I can hear"],
      [19, "Every thought come close and clear"],
    ] as [number, string][],
  },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function MusicPanel({ active }: { active: boolean }) {
  const [i, setI] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [lyricsOn, setLyricsOn] = useState(true);
  const t = TRACKS[i];
  const tick = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    tick.current = window.setInterval(() => {
      setPos((p) => {
        if (p + 1 >= t.duration) {
          if (repeat) return 0;
          setI((n) => (n + 1) % TRACKS.length);
          return 0;
        }
        return p + 1;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [playing, repeat, t.duration]);

  const lyricLoop = t.lyrics[t.lyrics.length - 1][0] + 8;
  const lp = pos % lyricLoop;
  let line = 0;
  t.lyrics.forEach(([s], idx) => {
    if (lp >= s) line = idx;
  });

  const skip = (d: number) => {
    setI((n) => (n + d + TRACKS.length) % TRACKS.length);
    setPos(0);
  };

  return (
    <div className="music">
      <div className="music-top">
        <div className="music-art" style={{ background: t.art }} aria-hidden="true">
          <span className="music-art-label">{t.title.split(" ")[0]}</span>
        </div>
        <div className="music-main">
          <h3 className="music-title">{t.title}</h3>
          <p className="music-artist">{t.artist}</p>
          <input
            className="scrub"
            type="range"
            min={0}
            max={t.duration}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Song position"
            tabIndex={active ? 0 : -1}
            style={{ ["--p" as any]: `${(pos / t.duration) * 100}%` }}
          />
          <div className="music-times tabular">
            <span>{fmt(pos)}</span>
            <span>-{fmt(t.duration - pos)}</span>
          </div>
          <div className="music-controls">
            <button type="button" className="ctl" aria-label="Previous track" onClick={() => skip(-1)}>
              <IconPrev size={34} />
            </button>
            <button type="button" className="ctl ctl-play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
              {playing ? <IconPause size={30} /> : <IconPlay size={30} />}
            </button>
            <button type="button" className="ctl" aria-label="Next track" onClick={() => skip(1)}>
              <IconNext size={34} />
            </button>
            <button type="button" className="ctl ctl-small" aria-pressed={repeat} aria-label="Repeat" onClick={() => setRepeat((r) => !r)}>
              <IconRepeat size={24} />
            </button>
            <button type="button" className="ctl ctl-small" aria-pressed={lyricsOn} aria-label="Lyrics" onClick={() => setLyricsOn((l) => !l)}>
              <IconLyrics size={24} />
            </button>
          </div>
          <span className="pill">Demo player · not connected to a music app</span>
        </div>
      </div>
      <div className="lyrics" aria-live="off">
        {lyricsOn ? (
          [0, 1, 2, 3].map((o) => {
            const l = t.lyrics[line + o];
            return (
              <p key={o} className={o === 0 ? "lyric-now" : "lyric-next"}>
                {l ? l[1] : "\u00a0"}
              </p>
            );
          })
        ) : (
          <p className="lyric-next">Lyrics are off. Turn them on with the lines button.</p>
        )}
      </div>
    </div>
  );
}
