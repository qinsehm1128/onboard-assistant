import type { ItemState, ProgressEvent } from "../shared/types.ts";

type Listener = (event: ProgressEvent) => void;

const listeners = new Set<Listener>();
const states = new Map<string, ItemState>();
const logs: ProgressEvent[] = [];

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: ProgressEvent): void {
  if (event.type === "log") {
    logs.push(event);
    if (logs.length > 400) logs.splice(0, logs.length - 400);
  }
  for (const listener of listeners) listener(event);
}

export function getState(id: string): ItemState | undefined {
  return states.get(id);
}

export function allStates(): Record<string, ItemState> {
  return Object.fromEntries(states);
}

export function recentLogs(): ProgressEvent[] {
  return logs.slice(-120);
}

export function setState(partial: ItemState): ItemState {
  const prev = states.get(partial.id);
  const next: ItemState = { ...prev, ...partial };
  states.set(partial.id, next);
  emit({ type: "item", id: partial.id, state: next, at: new Date().toISOString() });
  return next;
}

export function log(level: "info" | "warn" | "error", message: string, id?: string): void {
  emit({ type: "log", id, level, message, at: new Date().toISOString() });
}
