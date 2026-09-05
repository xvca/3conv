import test from "node:test";
import assert from "node:assert/strict";
import { FFmpegEngine } from "../lib/ffmpeg-engine.mjs";

const command = { args: ["-i", "input.wav", "output.mp3"], outputExt: "mp3" };
const files = [new File([new Uint8Array([1, 2, 3])], "a.wav")];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function mockWorker(overrides = {}) {
  return {
    loaded: false, terminated: false, disk: new Map(), events: {}, reads: 0, loads: 0,
    on(event, callback) { this.events[event] = callback; },
    async load(config) { this.loads++; this.config = config; this.loaded = true; },
    terminate() { this.terminated = true; this.loaded = false; this.disk.clear(); },
    async writeFile(name, data) { this.disk.set(name, data); },
    async exec() { this.disk.set("output.mp3", new Uint8Array([4, 5])); return 0; },
    async readFile(name) { this.reads++; return this.disk.get(name); },
    async deleteFile(name) { this.disk.delete(name); },
    ...overrides,
  };
}

test("concurrent loads share a worker; successful jobs clean their files", async () => {
  const worker = mockWorker();
  let creates = 0;
  const engine = new FFmpegEngine({ createFFmpeg: async () => { creates++; return worker; } });
  assert.equal(engine.load(), engine.load());
  await engine.load();
  assert.equal(creates, 1);
  assert.equal(worker.loads, 1);
  assert.match(worker.config.coreURL, /\/core\/ffmpeg-core.js$/);
  assert.deepEqual(await engine.run(files, command), new Uint8Array([4, 5]));
  assert.equal(worker.disk.size, 0);
  await engine.run(files, command);
  assert.equal(creates, 1);
  engine.reset();
});

test("non-zero exit codes never read partial output; a fresh worker can retry", async () => {
  const failed = mockWorker({ async exec() { this.disk.set("output.mp3", new Uint8Array([9])); return 1; } });
  const good = mockWorker();
  const workers = [failed, good];
  const engine = new FFmpegEngine({ createFFmpeg: async () => workers.shift() });
  await assert.rejects(engine.run(files, command), /exit code 1/);
  assert.equal(failed.reads, 0);
  assert.equal(failed.disk.size, 0);
  assert.equal(failed.terminated, true);
  await engine.run(files, command);
  engine.reset();
});

test("partial write failures and empty output reset the worker", async () => {
  for (const overrides of [
    { async writeFile(name, bytes) { this.disk.set(name, bytes); throw new Error("out of memory"); } },
    { async readFile() { return new Uint8Array(); } },
  ]) {
    const worker = mockWorker(overrides);
    const engine = new FFmpegEngine({ createFFmpeg: async () => worker });
    await assert.rejects(engine.run(files, command));
    assert.equal(worker.terminated, true);
    assert.equal(worker.disk.size, 0);
  }
});

test("load timeout terminates the worker and allows retry", async () => {
  const wait = deferred();
  const worker = mockWorker({ async load() { return wait.promise; }, terminate() { wait.reject(new Error("terminated")); } });
  const good = mockWorker();
  const workers = [worker, good];
  const engine = new FFmpegEngine({ createFFmpeg: async () => workers.shift(), loadTimeout: 10 });
  await assert.rejects(engine.load(), /timed out/);
  assert.equal(await engine.load(), good);
  engine.reset();
});

test("cancel during dynamic import cannot resurrect the old worker", async () => {
  const wait = deferred();
  const old = mockWorker();
  const engine = new FFmpegEngine({ createFFmpeg: () => wait.promise });
  const loading = engine.load();
  engine.reset();
  wait.resolve(old);
  await assert.rejects(loading, /cancelled/);
  assert.equal(old.terminated, true);
  assert.equal(old.loads, 0);
});

test("hung conversions time out rather than leaving the UI busy forever", async () => {
  const wait = deferred();
  const worker = mockWorker({ exec: () => wait.promise, terminate() { wait.reject(new Error("terminated")); this.disk.clear(); } });
  const engine = new FFmpegEngine({ createFFmpeg: async () => worker, runTimeout: 10 });
  await assert.rejects(engine.run(files, command), /timed out/);
  assert.equal(engine.running, false);
  assert.equal(worker.disk.size, 0);
});

test("text overlays load the bundled font before exec and clean it afterward", async () => {
  let fontLoads = 0;
  const worker = mockWorker({ async exec(args) {
    assert.ok(this.disk.has("/overlay-font.ttf"));
    assert.ok(args.some((arg) => arg.includes("drawtext=fontfile=/overlay-font.ttf:")));
    this.disk.set("output.mp3", new Uint8Array([4, 5]));
    return 0;
  } });
  const engine = new FFmpegEngine({ createFFmpeg: async () => worker, loadFont: async () => { fontLoads++; return new Uint8Array([1]); } });
  await engine.run(files, { ...command, args: ["-i", "input.wav", "-vf", "drawtext=text='2x'", "output.mp3"] });
  assert.equal(fontLoads, 1);
  assert.equal(worker.disk.size, 0);
  engine.reset();
});

test("ordinary jobs don't download the overlay font", async () => {
  const worker = mockWorker();
  const engine = new FFmpegEngine({ createFFmpeg: async () => worker, loadFont: async () => { throw new Error("unexpected font download"); } });
  await engine.run(files, command);
  engine.reset();
});

test("font loading is cancellable and cannot write into a terminated worker", async () => {
  const started = deferred();
  const worker = mockWorker();
  const engine = new FFmpegEngine({
    createFFmpeg: async () => worker,
    loadFont: (signal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("font load cancelled")), { once: true });
      started.resolve();
    }),
  });
  const job = engine.run(files, { ...command, args: ["-i", "input.wav", "-vf", "drawtext=text=2x", "output.mp3"] });
  await started.promise;
  engine.reset();
  await assert.rejects(job, /cancelled/);
  assert.equal(worker.disk.size, 0);
  assert.equal(worker.terminated, true);
});

test("rejects overlapping conversions and permits cancellation", async () => {
  const wait = deferred();
  const started = deferred();
  const worker = mockWorker({ exec() { started.resolve(); return wait.promise; }, terminate() { wait.reject(new Error("terminated")); } });
  const engine = new FFmpegEngine({ createFFmpeg: async () => worker });
  const run = engine.run(files, command);
  await started.promise;
  await assert.rejects(engine.run(files, command), /already running/);
  engine.reset();
  await assert.rejects(run, /terminated/);
  assert.equal(engine.running, false);
});
