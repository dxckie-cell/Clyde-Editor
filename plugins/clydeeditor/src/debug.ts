// in-app debug log, shown at the bottom of the plugin settings so it can be
// read (and copied) on the phone without logcat

const TAG = "[ClydeEditor]";
const MAX_LINES = 400;

export const logs: string[] = [];

// how many times each patched function ran for Clyde, shown at the top of the log
export const counters: Record<string, number> = {};

const listeners = new Set<() => void>();

function stamp(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function show(value: any): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "function") return "[fn]";
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[circular]";
        seen.add(v);
      }
      return v;
    });
  } catch {
    return String(value);
  }
}

function notify(): void {
  listeners.forEach((l) => {
    try { l(); } catch { /* a dead listener must not break logging */ }
  });
}

export function dlog(message: string, data?: any): void {
  const line = data === undefined ? message : `${message} ${show(data)}`;
  logs.push(`${stamp()} ${line}`);
  if (logs.length > MAX_LINES) logs.splice(0, logs.length - MAX_LINES);
  try {
    console.log(`${TAG} ${line}`);
  } catch {
    // logging must never break the plugin
  }
  notify();
}

// counts a call, and logs the first few times so it is visible that it happened
// without flooding the log (these functions run on every render)
export function hit(key: string, data?: any, logFirst = 3): number {
  const n = (counters[key] = (counters[key] ?? 0) + 1);
  if (n <= logFirst) dlog(`${key} (call #${n})`, data);
  else notify();
  return n;
}

// names used by diagnostics.ts, which expects these from this module
export const BUILD = "1.1.0-debug";

export function debug(message: string): void {
  dlog(message);
}

// short description of a value for a log line
export function describe(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value.length > 80 ? value.slice(0, 80) + "..." : value);
  if (typeof value === "object") return `{${Object.keys(value).slice(0, 15).join(", ")}}`;
  return String(value);
}

export function clearLogs(): void {
  logs.length = 0;
  for (const k of Object.keys(counters)) delete counters[k];
  notify();
}

export function getLogText(): string {
  const head = Object.keys(counters).length
    ? ["counters:", ...Object.entries(counters).map(([k, v]) => `  ${k}: ${v}`), ""]
    : [];
  return [...head, ...logs].join("\n");
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
