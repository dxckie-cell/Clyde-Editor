// small in-app log, shown at the bottom of the plugin settings so problems can
// be read (and copied) on the phone without logcat

const TAG = "[ClydeEditor]";
const MAX_LINES = 100;

export const logs: string[] = [];

const listeners = new Set<() => void>();

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function show(value: any): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
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
  const line = data === undefined ? message : `${message}: ${show(data)}`;
  logs.push(`${stamp()} ${line}`);
  if (logs.length > MAX_LINES) logs.splice(0, logs.length - MAX_LINES);
  try {
    console.log(`${TAG} ${line}`);
  } catch {
    // logging must never break the plugin
  }
  notify();
}

export function clearLogs(): void {
  logs.length = 0;
  notify();
}

export function getLogText(): string {
  return logs.join("\n");
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
