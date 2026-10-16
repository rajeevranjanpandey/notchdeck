import { useState } from "react";
import { load, save } from "../lib/storage";
import { IconExternal, IconVideo } from "../components/Icons";

interface Recent {
  id: string;
  title: string;
}

/** Pull the 11-character video id out of the common YouTube link shapes. */
export function videoId(link: string): string | null {
  const s = link.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function YouTubePanel({ active }: { active: boolean }) {
  const [link, setLink] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>(() => load("nd.yt.recent", []));
  const [err, setErr] = useState("");

  const play = (id: string, title?: string) => {
    setErr("");
    setCurrent(id);
    const next = [{ id, title: title || `Video ${id}` }, ...recent.filter((r) => r.id !== id)].slice(0, 5);
    setRecent(next);
    save("nd.yt.recent", next);
    // Fetch the real title without an API key (oEmbed allows browser calls).
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.title) return;
        setRecent((list) => {
          const upd = list.map((r) => (r.id === id ? { ...r, title: j.title } : r));
          save("nd.yt.recent", upd);
          return upd;
        });
      })
      .catch(() => undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = videoId(link);
    if (!id) {
      setErr("That does not look like a YouTube link.");
      return;
    }
    setLink("");
    play(id);
  };

  const popOut = () => {
    if (!current) return;
    window.open(`https://www.youtube-nocookie.com/embed/${current}?autoplay=1`, "notchdeck-video", "width=480,height=270,popup=yes");
  };

  return (
    <div className="yt">
      <form className="yt-form" onSubmit={submit}>
        <IconVideo size={22} />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link" aria-label="YouTube link" />
        <button type="submit" className="btn-light">
          Play
        </button>
      </form>
      {err && <p className="panel-error">{err}</p>}
      <div className="yt-stage">
        {current && active ? (
          <iframe
            key={current}
            src={`https://www.youtube-nocookie.com/embed/${current}?autoplay=1&rel=0`}
            title="YouTube video"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="yt-empty">
            <IconVideo size={40} />
            <span>{current ? "Paused while the panel is hidden" : "Paste a link above and it plays right here"}</span>
          </div>
        )}
      </div>
      <div className="yt-bottom">
        <div className="yt-recent">
          <span className="eyebrow-dark">Recent</span>
          {recent.length === 0 && <span className="muted">Nothing yet. Your last five videos show up here.</span>}
          {recent.map((r) => (
            <button key={r.id} type="button" className="yt-item" onClick={() => play(r.id, r.title)} title={r.title}>
              <img src={`https://i.ytimg.com/vi/${r.id}/default.jpg`} alt="" loading="lazy" />
              <span>{r.title}</span>
            </button>
          ))}
        </div>
        {current && (
          <div className="yt-actions">
            <button type="button" className="btn-ghost" onClick={popOut}>
              Pop out
            </button>
            <a className="btn-ghost" href={`https://www.youtube.com/watch?v=${current}`} target="_blank" rel="noreferrer">
              <IconExternal size={16} /> Open in browser
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
