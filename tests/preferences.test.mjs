import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DEFAULT_MODEL } from "../lib/models.mjs";
import { getPreferencesSnapshot, setPreferences, subscribePreferences, usePreferences } from "../lib/preferences.mjs";

let storage, blocked;
beforeEach((t) => {
  storage = new Map();
  blocked = false;
  const originals = new Map(["window", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key) { if (blocked) throw new Error("Storage blocked"); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error("Storage blocked"); storage.set(key, value); },
  } });
  setPreferences({ model: DEFAULT_MODEL, reasoningEffort: "low" });
  storage.clear();
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
});

const read = () => JSON.parse(getPreferencesSnapshot());

test("preferences use a stable snapshot with valid defaults", () => {
  assert.deepEqual(read(), { model: DEFAULT_MODEL, reasoningEffort: "low" });
  assert.equal(getPreferencesSnapshot(), getPreferencesSnapshot());
  storage.set("openrouter_model", "removed/model");
  storage.set("openrouter_reasoning_effort", "max");
  assert.deepEqual(read(), { model: DEFAULT_MODEL, reasoningEffort: "low" });
});

test("saved preferences restore without persisting keys", () => {
  setPreferences({ model: "z-ai/glm-5.3-flash", reasoningEffort: "high", apiKey: "must-not-save" });
  assert.deepEqual(read(), { model: "z-ai/glm-5.3-flash", reasoningEffort: "high" });
  assert.deepEqual([...storage.keys()].sort(), ["openrouter_model", "openrouter_reasoning_effort"]);
  assert.ok(!JSON.stringify([...storage]).includes("must-not-save"));
});

test("switching to a model without medium effort resets to low", () => {
  setPreferences({ model: "z-ai/glm-5.3-flash", reasoningEffort: "medium" });
  assert.equal(read().reasoningEffort, "low");
});

test("preferences remain usable when storage fails", () => {
  blocked = true;
  assert.deepEqual(read(), { model: DEFAULT_MODEL, reasoningEffort: "low" });
  setPreferences({ model: "z-ai/glm-5.3-flash", reasoningEffort: "high" });
  assert.deepEqual(read(), { model: "z-ai/glm-5.3-flash", reasoningEffort: "high" });
  assert.equal(storage.size, 0);
  blocked = false;
  setPreferences({ model: DEFAULT_MODEL, reasoningEffort: "medium" });
  assert.equal(storage.get("openrouter_reasoning_effort"), "medium");
});

test("subscriptions cover local changes and other tabs and unsubscribe cleanly", () => {
  let notifications = 0;
  const unsubscribe = subscribePreferences(() => { notifications++; });
  setPreferences({ model: DEFAULT_MODEL, reasoningEffort: "high" });
  assert.equal(notifications, 1);
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: "openrouter_model" });
  window.dispatchEvent(event);
  assert.equal(notifications, 2);
  unsubscribe();
  window.dispatchEvent(event);
  setPreferences({ model: DEFAULT_MODEL, reasoningEffort: "low" });
  assert.equal(notifications, 2);
});

test("server rendering uses deterministic defaults, not browser storage", () => {
  setPreferences({ model: "z-ai/glm-5.3-flash", reasoningEffort: "high" });
  function Settings() {
    const preferences = usePreferences();
    return createElement("span", null, `${preferences.ready}:${preferences.model}:${preferences.reasoningEffort}`);
  }
  assert.equal(renderToString(createElement(Settings)), `<span>false:${DEFAULT_MODEL}:low</span>`);
});
