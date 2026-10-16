import { useCallback, useEffect, useState } from "react";
import { load, save } from "../lib/storage";
import { IconSearch } from "../components/Icons";

// Live forecast from Open-Meteo (free, no key, no location permission).
// Only the city you type is sent.

interface Forecast {
  place: string;
  temp: number;
  code: number;
  hi: number;
  lo: number;
  hours: { t: string; temp: number; code: number }[];
  days: { d: string; hi: number; lo: number; code: number }[];
}

const CODE: Record<number, [string, string]> = {
  0: ["Clear sky", "sun"],
  1: ["Mostly clear", "sun-cloud"],
  2: ["Partly cloudy", "sun-cloud"],
  3: ["Overcast", "cloud"],
  45: ["Fog", "fog"],
  48: ["Rime fog", "fog"],
  51: ["Light drizzle", "rain"],
  53: ["Drizzle", "rain"],
  55: ["Heavy drizzle", "rain"],
  61: ["Light rain", "rain"],
  63: ["Rain", "rain"],
  65: ["Heavy rain", "rain"],
  71: ["Light snow", "snow"],
  73: ["Snow", "snow"],
  75: ["Heavy snow", "snow"],
  80: ["Showers", "rain"],
  81: ["Showers", "rain"],
  82: ["Violent showers", "storm"],
  95: ["Thunderstorm", "storm"],
  96: ["Thunder and hail", "storm"],
  99: ["Thunder and hail", "storm"],
};
const describe = (c: number) => CODE[c] || ["Mixed", "cloud"];

export function WeatherPanel({ active }: { active: boolean }) {
  const [city, setCity] = useState(() => load("nd.weather.city", "Abu Dhabi"));
  const [unit, setUnit] = useState<"celsius" | "fahrenheit">(() => load("nd.weather.unit", "celsius"));
  const [input, setInput] = useState(city);
  const [data, setData] = useState<Forecast | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);

  const fetchWeather = useCallback(async (name: string, u: string) => {
    setState("loading");
    setErr("");
    try {
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`).then((r) => r.json());
      const hit = g?.results?.[0];
      if (!hit) throw new Error(`No place called "${name}" was found.`);
      const q = new URLSearchParams({
        latitude: String(hit.latitude),
        longitude: String(hit.longitude),
        current: "temperature_2m,weather_code",
        hourly: "temperature_2m,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        forecast_days: "7",
        temperature_unit: u,
      });
      const f = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((r) => r.json());
      const nowIdx = Math.max(0, f.hourly.time.findIndex((t: string) => t >= f.current.time.slice(0, 13)));
      setData({
        place: [hit.name, hit.country_code].filter(Boolean).join(", "),
        temp: f.current.temperature_2m,
        code: f.current.weather_code,
        hi: f.daily.temperature_2m_max[0],
        lo: f.daily.temperature_2m_min[0],
        hours: f.hourly.time.slice(nowIdx, nowIdx + 6).map((t: string, j: number) => ({
          t: j === 0 ? "Now" : `${Number(t.slice(11, 13))}:00`,
          temp: f.hourly.temperature_2m[nowIdx + j],
          code: f.hourly.weather_code[nowIdx + j],
        })),
        days: f.daily.time.map((d: string, j: number) => ({
          d: j === 0 ? "Today" : new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "short" }),
          hi: f.daily.temperature_2m_max[j],
          lo: f.daily.temperature_2m_min[j],
          code: f.daily.weather_code[j],
        })),
      });
      setState("idle");
    } catch (e: any) {
      setErr(e?.message || "The weather service did not answer.");
      setState("error");
    }
  }, []);

  // Load lazily the first time the panel is shown.
  useEffect(() => {
    if (active && !loadedOnce) {
      setLoadedOnce(true);
      void fetchWeather(city, unit);
    }
  }, [active, loadedOnce, city, unit, fetchWeather]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = input.trim();
    if (!name) return;
    setCity(name);
    save("nd.weather.city", name);
    void fetchWeather(name, unit);
  };

  const switchUnit = (u: "celsius" | "fahrenheit") => {
    setUnit(u);
    save("nd.weather.unit", u);
    void fetchWeather(city, u);
  };

  const r = (n: number) => Math.round(n);
  const sym = unit === "celsius" ? "C" : "F";

  return (
    <div className="weather">
      <form className="weather-search" onSubmit={submit}>
        <IconSearch size={20} />
        <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="City" placeholder="Type a city" />
        <div className="seg" role="group" aria-label="Temperature unit">
          <button type="button" aria-pressed={unit === "celsius"} onClick={() => switchUnit("celsius")}>
            °C
          </button>
          <button type="button" aria-pressed={unit === "fahrenheit"} onClick={() => switchUnit("fahrenheit")}>
            °F
          </button>
        </div>
      </form>

      {state === "error" && <p className="panel-error">{err}</p>}
      {state === "loading" && !data && <div className="weather-skeleton" aria-label="Loading forecast" />}
      {data && (
        <div className={`weather-body ${state === "loading" ? "is-dim" : ""}`}>
          <div className="weather-now">
            <Glyph kind={describe(data.code)[1]} size={84} className="weather-glyph" />
            <div>
              <div className="weather-temp tabular">
                {r(data.temp)}°{sym}
              </div>
              <div className="weather-desc">
                {describe(data.code)[0]} · {data.place}
              </div>
              <div className="weather-hl tabular">
                H {r(data.hi)}° · L {r(data.lo)}°
              </div>
            </div>
            <div className="weather-hours">
              {data.hours.map((h) => (
                <div key={h.t} className="hour">
                  <span>{h.t}</span>
                  <Glyph kind={describe(h.code)[1]} size={26} />
                  <span className="tabular">{r(h.temp)}°</span>
                </div>
              ))}
            </div>
          </div>
          <div className="weather-days">
            {data.days.map((d) => (
              <div key={d.d} className="day">
                <span className="day-name">{d.d}</span>
                <Glyph kind={describe(d.code)[1]} size={24} label={describe(d.code)[0]} />
                <span className="tabular">{r(d.hi)}°</span>
                <span className="tabular muted">{r(d.lo)}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Glyph({ kind, size, className, label }: { kind: string; size: number; className?: string; label?: string }) {
  const sun = <g stroke="#ffd166"><circle cx="10" cy="10" r="4" fill="#ffd166" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></g>;
  const cloud = (dx = 0, dy = 0, fill = "#d8dbe2") => <path transform={`translate(${dx} ${dy})`} d="M7 19h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.6A3.2 3.2 0 0 0 7 19z" fill={fill} stroke="none" />;
  const drops = (c: string) => <path d="M8 21l-1 2M12 21l-1 2M16 21l-1 2" stroke={c} />;
  let body;
  switch (kind) {
    case "sun": body = <g transform="translate(2 2)">{sun}</g>; break;
    case "sun-cloud": body = <>{<g transform="translate(-1 -2)">{sun}</g>}{cloud(1, 0)}</>; break;
    case "fog": body = <path d="M3 9h18M5 13h14M3 17h18" stroke="#c2c6cf" />; break;
    case "rain": body = <>{cloud(0, -3, "#aab3c2")}{drops("#6cb4ff")}</>; break;
    case "snow": body = <>{cloud(0, -3, "#e5e9f0")}<path d="M8 21h.01M12 22h.01M16 21h.01" stroke="#fff" strokeWidth={3} /></>; break;
    case "storm": body = <>{cloud(0, -3, "#8d95a5")}<path d="M12 16l-2 4h3l-2 4" stroke="#ffd166" /></>; break;
    default: body = cloud(0, -1);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 25" fill="none" strokeWidth={1.8} strokeLinecap="round" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {body}
    </svg>
  );
}
