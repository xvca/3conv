import test from "node:test";
import assert from "node:assert/strict";
import { generateClientCommand, generateWithOpenRouter, OPENROUTER_URL } from "../lib/generation.mjs";
import { DEFAULT_MODEL } from "../lib/models.mjs";

const input = { prompt: "convert to mp3", filenames: ["a.wav"] };
const command = { args: ["-i", "input.wav", "output.mp3"], outputExt: "mp3", suffix: "converted" };
const completion = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(command) } }], usage: { cost: 0.001 } };

test("personal keys go directly to OpenRouter, only in the authorization header", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    assert.equal(url, OPENROUTER_URL);
    assert.equal(options.headers.Authorization, "Bearer personal-test-key");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.cache, "no-store");
    assert.ok(!options.body.includes("personal-test-key"));
    const body = JSON.parse(options.body);
    assert.equal(body.model, DEFAULT_MODEL);
    assert.deepEqual(body.reasoning, { effort: "low", exclude: true });
    assert.equal(body.provider.max_price.completion, 5);
    return Response.json(completion);
  });
  assert.deepEqual(await generateClientCommand(input, { apiKey: " personal-test-key " }), { command, cost: 0.001 });
  assert.deepEqual(calls, [OPENROUTER_URL]);
});

test("free-credit requests contain no key and use only the local endpoint", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/generate");
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), input);
    return Response.json({ command, cost: 0.001 });
  });
  // Even an extraneous secret in the input object must not reach our server.
  await generateClientCommand({ ...input, apiKey: "accidentally-attached-key" });
});

test("personal-key failures never fall back to our server or expose provider response bodies", async (t) => {
  for (const status of [401, 402, 429, 503]) {
    const calls = [];
    const mock = t.mock.method(globalThis, "fetch", async (url) => {
      calls.push(url);
      return new Response("sensitive upstream response", { status });
    });
    await assert.rejects(generateClientCommand(input, { apiKey: "personal-test-key" }), (error) => {
      assert.ok(!error.message.includes("sensitive"));
      assert.ok(!error.message.includes("personal-test-key"));
      return true;
    });
    assert.deepEqual(calls, [OPENROUTER_URL]);
    mock.mock.restore();
  }
});

test("CORS/network failures don't trigger a server fallback or leak request details", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    throw new Error("internal request details: personal-test-key");
  });
  await assert.rejects(generateClientCommand(input, { apiKey: "personal-test-key" }), /Could not reach the model provider/);
  assert.deepEqual(calls, [OPENROUTER_URL]);
});

test("direct requests validate inputs and model output just like server requests", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: "{}" } }] });
  });
  await assert.rejects(generateClientCommand({ ...input, model: "expensive/model" }, { apiKey: "test-key" }));
  assert.equal(calls, 0);
  await assert.rejects(generateClientCommand(input, { apiKey: "test-key" }), /invalid conversion command/);
  assert.equal(calls, 1);
});

test("direct generation timeout aborts the outgoing request", async (t) => {
  // Keep the event loop alive while the native AbortSignal timeout is pending.
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(keepAlive));
  t.mock.method(globalThis, "fetch", async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  await assert.rejects(generateWithOpenRouter(input, { apiKey: "test-key", timeoutMs: 10 }), (error) => error.status === 504);
});

test("direct generation can be cancelled", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const pending = generateClientCommand(input, { apiKey: "test-key", signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.status === 499);
});
