import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/generate/route.js";
import { DEFAULT_MODEL } from "../lib/models.mjs";

beforeEach((t) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "server-test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  });
});

const command = { args: ["-i", "input.wav", "output.mp3"], outputExt: "mp3", suffix: "converted" };
const request = (body = {}) => new Request("http://localhost/api/generate", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "convert to mp3", filenames: ["test.wav"], ...body }),
});

test("generation validates requests before spending credits", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("must not call"); });
  for (const body of [{ prompt: "" }, { filenames: [] }, { model: "expensive/model" }, { reasoningEffort: "max" }, { apiKey: 1 }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  const invalid = new Request("http://localhost/api/generate", { method: "POST", body: "{" });
  assert.equal((await POST(invalid)).status, 400);
  assert.equal(calls, 0);
});

test("forwards reasoning and output-price cap; returns only the validated command and cost", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, "Bearer server-test-key");
    assert.equal(payload.model, DEFAULT_MODEL);
    assert.deepEqual(payload.reasoning, { effort: "low", exclude: true });
    assert.equal(payload.provider.max_price.completion, 5);
    assert.equal(payload.max_tokens, 4096);
    assert.equal(JSON.parse(payload.messages[1].content).files[0].inputName, "input.wav");
    return Response.json({ choices: [{ message: { content: JSON.stringify(command), reasoning: "not returned" }, finish_reason: "stop" }], usage: { cost: 0.001 } });
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { command, cost: 0.001 });
});

test("the free-credit endpoint rejects personal keys rather than forwarding them", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("must not forward"); });
  const response = await POST(request({ apiKey: "personal-test-key" }));
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
  assert.ok(!JSON.stringify(await response.json()).includes("personal-test-key"));
});

test("the free-credit endpoint requires a server key", async (t) => {
  delete process.env.OPENROUTER_API_KEY;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("must not call"); });
  assert.equal((await POST(request())).status, 401);
  assert.equal(calls, 0);
});

test("rejects truncated, empty, and malformed model output", async (t) => {
  for (const choice of [
    { finish_reason: "length", message: { content: "{" } },
    { message: { content: null } },
    { message: { content: "{}" } },
    { message: { content: JSON.stringify({ ...command, args: ["-i", "missing.wav", "output.mp3"] }) } },
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [choice] }));
    assert.equal((await POST(request())).status, 502);
    mock.mock.restore();
  }
});

test("upstream auth, credits, rate limit and server errors return once, without retries", async (t) => {
  for (const status of [401, 402, 429, 503]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("provider error", { status }); });
    const response = await POST(request());
    assert.equal(response.status, status === 503 ? 502 : status);
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});
