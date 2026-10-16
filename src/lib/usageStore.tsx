import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { load, save } from "./storage";
import { alertLevel } from "../../shared/usage-core.mjs";
import {
  DEFAULT_AGENT,
  DEFAULT_PROVIDERS,
  fetchProvider,
  isLocal,
  needsKey,
  parseImportedFolder,
  pressure,
  type AgentConfig,
  type ProviderConfig,
  type ProviderResult,
} from "./providers";

export interface Settings {
  autoRefreshMin: number;
  warnAt: number;
  critAt: number;
  notify: boolean;
}

export interface Toast {
  id: number;
  tone: "warning" | "critical" | "info";
  text: string;
}

const DEFAULT_SETTINGS: Settings = { autoRefreshMin: 5, warnAt: 75, critAt: 90, notify: false };

interface Store {
  providers: ProviderConfig[];
  results: Record<string, ProviderResult>;
  keys: Record<string, string>;
  agent: AgentConfig;
  agentStatus: "unknown" | "checking" | "online" | "offline";
  settings: Settings;
  toasts: Toast[];
  updateProvider(id: string, patch: Partial<ProviderConfig>): void;
  addCustom(): string;
  removeProvider(id: string): void;
  setKey(id: string, key: string): void;
  setAgent(a: Partial<AgentConfig>): void;
  checkAgent(): Promise<boolean>;
  setSettings(s: Partial<Settings>): void;
  refresh(id: string, manual?: boolean): Promise<void>;
  refreshAll(): Promise<void>;
  importFolder(id: string, files: FileList): Promise<void>;
  dismissToast(id: number): void;
  connectedCount: number;
}

const Ctx = createContext<Store | null>(null);

// Keys live apart from the rest of the settings. "Remember" puts a key in
// localStorage; otherwise it lives in sessionStorage and is gone with the tab.
function loadKeys(providers: ProviderConfig[]) {
  const persisted = load<Record<string, string>>("nd.keys", {}, true);
  const session = load<Record<string, string>>("nd.keys", {}, false);
  const out: Record<string, string> = {};
  for (const p of providers) out[p.id] = (p.remember ? persisted[p.id] : session[p.id]) || "";
  return out;
}

function storeKeys(providers: ProviderConfig[], keys: Record<string, string>) {
  const persisted: Record<string, string> = {};
  const session: Record<string, string> = {};
  for (const p of providers) {
    if (!keys[p.id]) continue;
    (p.remember ? persisted : session)[p.id] = keys[p.id];
  }
  save("nd.keys", persisted, true);
  save("nd.keys", session, false);
}

export function UsageProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<ProviderConfig[]>(() => load("nd.providers", DEFAULT_PROVIDERS));
  const [keys, setKeys] = useState<Record<string, string>>(() => loadKeys(load("nd.providers", DEFAULT_PROVIDERS)));
  const [agent, setAgentState] = useState<AgentConfig>(() => load("nd.agent", DEFAULT_AGENT));
  const [settings, setSettingsState] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...load("nd.settings", {}) }));
  const [results, setResults] = useState<Record<string, ProviderResult>>(() => load("nd.results", {}));
  const [agentStatus, setAgentStatus] = useState<Store["agentStatus"]>("unknown");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastLevel = useRef<Record<string, string>>({});
  const toastId = useRef(1);

  useEffect(() => save("nd.providers", providers), [providers]);
  useEffect(() => storeKeys(providers, keys), [providers, keys]);
  useEffect(() => save("nd.agent", agent), [agent]);
  useEffect(() => save("nd.settings", settings), [settings]);
  // Only summaries are cached, never raw logs or keys.
  useEffect(() => {
    const slim: Record<string, ProviderResult> = {};
    for (const [id, r] of Object.entries(results)) if (r.status === "ok") slim[id] = r;
    save("nd.results", slim);
  }, [results]);

  const pushToast = useCallback((tone: Toast["tone"], text: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000);
  }, []);

  const checkAlerts = useCallback(
    (cfg: ProviderConfig, data: any) => {
      const pct = pressure(cfg, data);
      const level = alertLevel(pct, settings.warnAt, settings.critAt);
      const prev = lastLevel.current[cfg.id];
      lastLevel.current[cfg.id] = level;
      if ((level === "warning" || level === "critical") && prev !== level && pct != null) {
        const text = `${cfg.name} is at ${Math.round(pct)}% of its ${cfg.kind === "codex" ? "plan limit" : cfg.budget ? "budget" : "limit"}.`;
        pushToast(level, text);
        if (settings.notify && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("NotchDeck usage alert", { body: text });
          } catch {
            /* some embedded previews block notifications */
          }
        }
      }
    },
    [pushToast, settings],
  );

  const providersRef = useRef(providers);
  providersRef.current = providers;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const refresh = useCallback(
    async (id: string, manual = false) => {
      const cfg = providersRef.current.find((p) => p.id === id);
      if (!cfg || !cfg.enabled) return;
      // Background refreshes skip anything not set up yet, so a first visit
      // shows calm "not set up" cards instead of a wall of errors.
      const unset = (needsKey(cfg.kind) && !keysRef.current[id]) || (isLocal(cfg.kind) && !agentRef.current.token);
      if (unset && !manual) return;
      // A folder import is a snapshot, so do not replace it with an agent error.
      setResults((r) => ({ ...r, [id]: { ...r[id], status: "loading" } }));
      try {
        const { data, via } = await fetchProvider(cfg, keysRef.current[id] || "", agentRef.current);
        setResults((r) => ({ ...r, [id]: { status: "ok", data, via, updatedAt: Date.now() } }));
        checkAlerts(cfg, data);
      } catch (e: any) {
        setResults((r) => {
          const prev = r[id];
          if (prev?.data?.source === "folder-import" && !agentRef.current.token) return { ...r, [id]: { ...prev, status: "ok" } };
          return { ...r, [id]: { ...prev, status: "error", error: e?.message || String(e) } };
        });
      }
    },
    [checkAlerts],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all(providersRef.current.filter((p) => p.enabled).map((p) => refresh(p.id)));
  }, [refresh]);

  const checkAgent = useCallback(async () => {
    const a = agentRef.current;
    if (!a.token) {
      setAgentStatus("offline");
      return false;
    }
    setAgentStatus("checking");
    try {
      const r = await fetch(`${a.url}/health`, { headers: { "X-NotchDeck-Token": a.token }, cache: "no-store" });
      const ok = r.ok;
      setAgentStatus(ok ? "online" : "offline");
      if (!ok && r.status === 401) pushToast("info", "The agent is running but the pairing code does not match.");
      return ok;
    } catch {
      setAgentStatus("offline");
      return false;
    }
  }, [pushToast]);

  // First load: check the agent, then pull everything that is configured.
  useEffect(() => {
    checkAgent().finally(() => {
      void refreshAll();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settings.autoRefreshMin) return;
    const t = window.setInterval(() => void refreshAll(), settings.autoRefreshMin * 60_000);
    return () => window.clearInterval(t);
  }, [settings.autoRefreshMin, refreshAll]);

  const importFolder = useCallback(
    async (id: string, files: FileList) => {
      const cfg = providersRef.current.find((p) => p.id === id);
      if (!cfg || (cfg.kind !== "codex" && cfg.kind !== "claude-code")) return;
      setResults((r) => ({ ...r, [id]: { ...r[id], status: "loading" } }));
      try {
        const data = await parseImportedFolder(cfg.kind, files);
        setResults((r) => ({ ...r, [id]: { status: "ok", data, via: "folder import", updatedAt: Date.now() } }));
        checkAlerts(cfg, data);
      } catch (e: any) {
        setResults((r) => ({ ...r, [id]: { status: "error", error: e?.message || String(e) } }));
      }
    },
    [checkAlerts],
  );

  const store: Store = useMemo(
    () => ({
      providers,
      results,
      keys,
      agent,
      agentStatus,
      settings,
      toasts,
      updateProvider: (id, patch) => setProviders((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),
      addCustom: () => {
        const id = `custom-${Date.now().toString(36)}`;
        setProviders((ps) => [
          ...ps,
          {
            id,
            kind: "custom",
            name: "Custom API",
            enabled: true,
            remember: true,
            budget: null,
            custom: { url: "", authHeader: "Authorization", authPrefix: "Bearer ", usedPath: "", limitPath: "", unit: "USD" },
          },
        ]);
        return id;
      },
      removeProvider: (id) => {
        setProviders((ps) => ps.filter((p) => p.id !== id));
        setResults((r) => {
          const { [id]: _drop, ...rest } = r;
          return rest;
        });
        setKeys((k) => {
          const { [id]: _drop, ...rest } = k;
          return rest;
        });
      },
      setKey: (id, key) => setKeys((k) => ({ ...k, [id]: key.trim() })),
      setAgent: (a) => setAgentState((prev) => ({ ...prev, ...a })),
      checkAgent,
      setSettings: (s) => setSettingsState((prev) => ({ ...prev, ...s })),
      refresh,
      refreshAll,
      importFolder,
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
      connectedCount: providers.filter((p) => results[p.id]?.status === "ok").length,
    }),
    [providers, results, keys, agent, agentStatus, settings, toasts, checkAgent, refresh, refreshAll, importFolder],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useUsage() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useUsage must be used inside UsageProvider");
  return s;
}
