import test from "node:test";
import assert from "node:assert/strict";
import { getInputNames, getExecutionArgs, parseCommandResponse, validateCommand } from "../lib/conversion.mjs";
import { MODELS, DEFAULT_MODEL, getGenerationOptions } from "../lib/models.mjs";

const command = { args: ["-i", "input.mp4", "-c", "copy", "output.mkv"], outputExt: "mkv", suffix: "converted" };

test("input mapping handles duplicate original filenames and uppercase extensions", () => {
  assert.deepEqual(getInputNames(["movie.MP4"]), ["input.mp4"]);
  assert.deepEqual(getInputNames(["movie.MP4", "movie.MP4"]), ["input0.mp4", "input1.mp4"]);
  for (const input of [null, [], ["unknown.txt"], [null], Array(21).fill("a.mp4")]) {
    assert.throws(() => getInputNames(input));
  }
});

test("parses JSON and markdown-fenced JSON without accepting surrounding text", () => {
  assert.deepEqual(parseCommandResponse(JSON.stringify(command), ["a.mp4"]), command);
  assert.deepEqual(parseCommandResponse('```json\n' + JSON.stringify(command) + '\n```', ["a.mp4"]), command);
  for (const input of [null, "", "{", "Here is the command: " + JSON.stringify(command)]) {
    assert.throws(() => parseCommandResponse(input, ["a.mp4"]));
  }
});

test("rejects malformed commands, unknown inputs, and incorrect outputs", () => {
  for (const invalid of [
    null, {}, { ...command, args: "-i input.mp4 output.mkv" },
    { ...command, args: ["-i", "input.mp4", 123, "output.mkv"] },
    { ...command, args: ["-i", "https://example.com/a.mp4", "output.mkv"] },
    { ...command, args: ["-i", "input0.mp4", "output.mkv"] },
    { ...command, args: ["-i", "input.mp4", "other.mkv"] },
    { ...command, args: ["ffmpeg", ...command.args] },
    { ...command, outputExt: "../mkv" },
  ]) assert.throws(() => validateCommand(invalid, ["a.mp4"]));
  assert.equal(validateCommand({ ...command, suffix: "../../my output" }, ["a.mp4"]).suffix, "myoutput");
});

test("multi-file commands use explicit virtual filenames", () => {
  const multi = { args: ["-loop", "1", "-i", "input0.png", "-i", "input1.mp3", "-shortest", "output.mp4"], outputExt: "mp4" };
  assert.equal(validateCommand(multi, ["cover.png", "song.mp3"]).outputExt, "mp4");
});

test("bounds decoder, encoder and filter threads and is idempotent", () => {
  const args = ["-filter_threads", "64", "-threads:v", "32", "-i", "input0.png", "-i", "input1.wav", "-threads", "0", "output.mp4"];
  const bounded = getExecutionArgs(args);
  assert.deepEqual(bounded, ["-filter_threads", "2", "-filter_complex_threads", "2", "-threads", "2", "-i", "input0.png", "-threads", "2", "-i", "input1.wav", "-threads", "2", "output.mp4"]);
  assert.deepEqual(getExecutionArgs(bounded), bounded);
});

test("every offered model supports reasoning and stays under the output price ceiling", () => {
  for (const model of MODELS) {
    assert.ok(model.outputPrice <= 5);
    for (const effort of model.efforts) {
      const options = getGenerationOptions(model.id, effort);
      assert.deepEqual(options.reasoning, { effort, exclude: true });
      assert.equal(options.provider.max_price.completion, 5);
      assert.ok(options.max_tokens >= 4096 && options.max_tokens <= 8192);
    }
  }
  assert.equal(getGenerationOptions().model, DEFAULT_MODEL);
  assert.throws(() => getGenerationOptions("anthropic/claude-opus-5"));
  assert.throws(() => getGenerationOptions(DEFAULT_MODEL, "max"));
  assert.throws(() => getGenerationOptions("z-ai/glm-5.3-flash", "medium"));
});
