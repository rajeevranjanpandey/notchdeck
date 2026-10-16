// Small wrapper around localStorage/sessionStorage.
// Some embedded previews block storage, so everything falls back to memory.
const memory = new Map<string, string>();

function pick(persist: boolean): Storage | null {
  try {
    const s = persist ? window.localStorage : window.sessionStorage;
    const probe = "__nd_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function load<T>(key: string, fallback: T, persist = true): T {
  const s = pick(persist);
  const raw = s ? s.getItem(key) : memory.get(key) ?? null;
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown, persist = true) {
  const raw = JSON.stringify(value);
  const s = pick(persist);
  if (s) s.setItem(key, raw);
  else memory.set(key, raw);
}

export function remove(key: string) {
  for (const p of [true, false]) {
    const s = pick(p);
    if (s) s.removeItem(key);
  }
  memory.delete(key);
}
