import { useCallback } from "react";
import { NotchDemo } from "./components/NotchDemo";
import { UsageDashboard } from "./components/UsageDashboard";
import { UsageProvider } from "./lib/usageStore";

const FEATURES = [
  {
    id: "music",
    title: "Change the song without changing windows.",
    body: "Artwork, a scrub bar and the controls you reach for most sit right under the camera. Turn on lyrics and the current line moves along with the track.",
    points: ["Play, pause, skip and scrub", "Synced lyrics you can switch off", "Repeat with one tap"],
  },
  {
    id: "youtube",
    title: "Paste a link and keep watching while you work.",
    body: "Drop in any YouTube address, short link or Shorts URL. It plays inside the notch, pops out into a small window, and your last five videos wait in a list.",
    points: ["Works with youtu.be, watch, Shorts and embed links", "Pop out into a floating window", "Videos that refuse embedding open in your browser"],
  },
  {
    id: "weather",
    title: "The forecast, one glance up.",
    body: "Type a city once. You get the current temperature, today's high and low, the next few hours and a full week. Your location is never requested.",
    points: ["Live data from Open-Meteo", "Celsius or Fahrenheit", "Only the city name leaves the page"],
  },
  {
    id: "focus",
    title: "A focus timer in the corner of your eye.",
    body: "Pick 25, 45 or 60 minutes or dial in your own. A ring drains as you work, breaks start on their own, and the session count keeps you honest.",
    points: ["Presets plus one-minute steps", "Short breaks, then a long one after four rounds", "Keeps running while you switch panels"],
  },
];

export default function App() {
  const openDashboard = useCallback(() => {
    document.getElementById("usage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <UsageProvider>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <a className="brand" href="#top" aria-label="NotchDeck home">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <rect x="2" y="6" width="28" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M11 6h10v3.5a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 11 9.5z" fill="currentColor" />
          </svg>
          NotchDeck
        </a>
        <nav aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#usage">AI usage</a>
          <a href="#privacy">Privacy</a>
          <a href="#faq">FAQ</a>
        </nav>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <p className="eyebrow">For MacBooks with a notch, and the ones without</p>
          <h1>Make the notch earn its spot.</h1>
          <p className="lede">
            NotchDeck turns the black cutout at the top of your screen into a small control center: music, weather, YouTube, a focus timer and now a live meter for Codex,
            Claude and every API key you pay for.
          </p>
          <div className="hero-cta">
            <a className="btn-primary btn-lg" href="#usage">
              Track my AI usage
            </a>
            <a className="btn-secondary btn-lg" href="#features">
              See what it does
            </a>
          </div>
          <div className="demo-wrap">
            <NotchDemo onOpenDashboard={openDashboard} />
          </div>
        </section>

        <section className="features" id="features" aria-labelledby="features-title">
          <h2 id="features-title" className="section-title">
            One black shape. Five useful panels.
          </h2>
          {FEATURES.map((f, i) => (
            <div key={f.id} className={`feature ${i % 2 ? "flip" : ""}`}>
              <div className="feature-copy">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <ul>
                  {f.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className={`feature-art art-${f.id}`} aria-hidden="true">
                <span />
              </div>
            </div>
          ))}
        </section>

        <section className="usage-section" id="usage" aria-labelledby="usage-title">
          <div className="usage-intro">
            <span className="badge badge-new">New</span>
            <h2 id="usage-title" className="section-title">
              Know how much AI you have left before it runs out.
            </h2>
            <p className="lede">
              Hitting a Codex limit halfway through a refactor, or finding a surprise on the OpenRouter bill, is avoidable. Connect what you use and NotchDeck keeps one honest
              number for each: time until the limit resets, credits left, or money spent against a budget you choose.
            </p>
            <div className="sources">
              <div>
                <strong>Codex</strong>
                <span>5-hour and weekly plan limits, straight from the snapshots OpenAI sends to Codex</span>
              </div>
              <div>
                <strong>Claude Code</strong>
                <span>Tokens in the current 5-hour block, per model and per project</span>
              </div>
              <div>
                <strong>OpenRouter</strong>
                <span>Credits used today, this week and this month, and what remains on the key</span>
              </div>
              <div>
                <strong>OpenAI and Anthropic APIs</strong>
                <span>Organization spend and tokens with an Admin key</span>
              </div>
              <div>
                <strong>Anything else</strong>
                <span>Point it at any JSON usage endpoint and tell it where the numbers are</span>
              </div>
            </div>
          </div>
          <UsageDashboard />
        </section>

        <section className="small-things" aria-labelledby="small-title">
          <h2 id="small-title" className="section-title">
            And the small stuff.
          </h2>
          <div className="grid-3">
            <div>
              <h3>Alerts that fire once</h3>
              <p>Pick a warning level and an alert level. You hear about each one once per limit window, not every refresh.</p>
            </div>
            <div>
              <h3>Refresh on your schedule</h3>
              <p>Every minute, every five, every fifteen, or only when you press the button.</p>
            </div>
            <div>
              <h3>No sign up</h3>
              <p>There is no account and no NotchDeck server. Settings live in your browser and logs stay on your disk.</p>
            </div>
          </div>
        </section>

        <section className="privacy" id="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title" className="section-title">
            What stays with you, and what does not.
          </h2>
          <p className="lede">
            Keys and settings stay in this browser. Uncheck “Remember” and a key disappears when you close the tab. Data only moves when a feature needs it:
          </p>
          <dl className="flows">
            <div>
              <dt>Weather</dt>
              <dd>The city you type goes to Open-Meteo.</dd>
            </div>
            <div>
              <dt>YouTube</dt>
              <dd>The video loads from youtube-nocookie.com and its title from YouTube's public oEmbed.</dd>
            </div>
            <div>
              <dt>OpenRouter and OpenAI</dt>
              <dd>Your browser calls them directly with your key. Nothing passes through a third party.</dd>
            </div>
            <div>
              <dt>Anthropic</dt>
              <dd>Sent through the agent on your own computer, because Anthropic blocks admin calls from browsers.</dd>
            </div>
            <div>
              <dt>Codex and Claude Code</dt>
              <dd>Log files are read on your machine. Only totals reach this page, and only over 127.0.0.1.</dd>
            </div>
          </dl>
        </section>

        <section className="faq" id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="section-title">
            Questions worth asking.
          </h2>
          <details>
            <summary>Is this the Top Notch app?</summary>
            <p>
              No. NotchDeck is an independent rebuild of the idea shown on the Top Notch website, made to explore how it works and to add usage tracking. It is not affiliated
              with Top Notch, StartupStartup or Apple, and it uses none of their screenshots or artwork.
            </p>
          </details>
          <details>
            <summary>Where do the Codex numbers come from?</summary>
            <p>
              Every time Codex answers, OpenAI includes how much of your 5-hour and weekly allowance is used. Codex saves that in ~/.codex/sessions. NotchDeck reads the newest
              snapshot, so it is exact as of your last Codex turn and catches up the next time you use it.
            </p>
          </details>
          <details>
            <summary>Why does Claude Code ask me for a token budget?</summary>
            <p>
              Claude Code logs every token but Anthropic does not publish subscription limits as numbers. NotchDeck groups your messages into 5-hour blocks the way Claude does
              and compares the current block with the budget you set.
            </p>
          </details>
          <details>
            <summary>Why do OpenAI and Anthropic need an Admin key?</summary>
            <p>Both companies only expose organization usage and cost reports to admin keys. A normal project key cannot read them. The calls are read only.</p>
          </details>
          <details>
            <summary>Can I track Groq, Together, DeepSeek or my own gateway?</summary>
            <p>
              Yes, if it has a GET endpoint that returns JSON and allows browser requests. Add a custom API, paste the URL and key, and type the path to the number, such as
              data.usage or balance_infos[0].total_balance.
            </p>
          </details>
          <details>
            <summary>Will this run as a real Mac menu bar app?</summary>
            <p>
              This version runs in the browser so anyone can try it. The usage logic lives in one shared file that the local agent already uses, so a native wrapper can reuse
              it without changes.
            </p>
          </details>
        </section>
      </main>

      <footer className="foot">
        <span>NotchDeck · an independent rebuild with AI usage tracking</span>
        <span className="muted">Mac and MacBook are trademarks of Apple Inc. Codex, Claude and OpenRouter belong to their owners.</span>
      </footer>
    </UsageProvider>
  );
}
