import { useSyncExternalStore } from "react";
import { DEFAULT_EFFORT, MODELS } from "./models.mjs";

const CHANGE_EVENT = "3conv:preferences";
let volatileSnapshot = null;

function normalizePreferences(model, reasoningEffort) {
  const selected = MODELS.find((entry) => entry.id === model) || MODELS[0];
  return {
    model: selected.id,
    reasoningEffort: selected.efforts.includes(reasoningEffort) ? reasoningEffort : DEFAULT_EFFORT,
  };
}

const defaults = normalizePreferences();
const defaultSnapshot = JSON.stringify(defaults);

export function getPreferencesSnapshot() {
  if (volatileSnapshot !== null) return volatileSnapshot;
  try {
    return JSON.stringify(normalizePreferences(
      localStorage.getItem("openrouter_model"),
      localStorage.getItem("openrouter_reasoning_effort"),
    ));
  } catch {
    return defaultSnapshot;
  }
}

export function subscribePreferences(callback) {
  const onStorage = (event) => {
    if (event.key === null || event.key === "openrouter_model" || event.key === "openrouter_reasoning_effort") callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function setPreferences({ model, reasoningEffort }) {
  const next = normalizePreferences(model, reasoningEffort);
  // Keep settings usable for this tab if storage is blocked or full.
  volatileSnapshot = JSON.stringify(next);
  try {
    localStorage.setItem("openrouter_model", next.model);
    localStorage.setItem("openrouter_reasoning_effort", next.reasoningEffort);
    volatileSnapshot = null;
  } catch { /* The in-memory snapshot remains authoritative for this tab. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const getServerSnapshot = () => null;

export function usePreferences() {
  // A primitive snapshot stays referentially stable until the values change.
  // The server snapshot also makes the first hydration render deterministic.
  const snapshot = useSyncExternalStore(subscribePreferences, getPreferencesSnapshot, getServerSnapshot);
  return { ...(snapshot === null ? defaults : JSON.parse(snapshot)), ready: snapshot !== null };
}
