import test from "node:test";
import assert from "node:assert/strict";
import { prepareOverlayFonts, needsOverlayFont, OVERLAY_FONT_PATH } from "../lib/overlay-font.mjs";
import { getExecutionArgs } from "../lib/conversion.mjs";

const prepare = (filter) => prepareOverlayFonts(["-vf", filter])[1];

test("supplies a font for every drawtext filter from the reported command", () => {
  const graph = "[0:v]scale=720:720,setsar=1,setpts=0.5*PTS,drawtext=text='>>':fontsize=72:x=w-tw-40:y=40,drawtext=text='2x':fontsize=48:x=w-tw-40:y=130[v]";
  const args = getExecutionArgs(["-i", "input.mp4", "-filter_complex", graph, "-map", "[v]", "output.mp4"]);
  assert.equal(args[args.indexOf("-filter_complex") + 1].split(`fontfile=${OVERLAY_FONT_PATH}`).length, 3);
  assert.ok(args[args.indexOf("-filter_complex") + 1].endsWith("[v]"));
  assert.equal(needsOverlayFont(args), true);
  assert.deepEqual(getExecutionArgs(args), args);
});

test("replaces invented font paths while preserving output labels and named filter instances", () => {
  assert.equal(prepare("[0:v]drawtext@label=text='2x':fontfile='/usr/share/fonts/missing.ttf'[out]"),
    `[0:v]drawtext@label=fontfile=${OVERLAY_FONT_PATH}:text='2x'[out]`);
});

test("preserves punctuation, escapes and font-like strings inside overlay text", () => {
  const text = "drawtext=text='hello, drawtext=world; fontfile=fake: 2x':x=w-tw-20";
  assert.equal(prepare(text), `drawtext=fontfile=${OVERLAY_FONT_PATH}:text='hello, drawtext=world; fontfile=fake: 2x':x=w-tw-20`);
  assert.equal(prepare("drawtext=text=hello\\,world:x=20"), `drawtext=fontfile=${OVERLAY_FONT_PATH}:text=hello\\,world:x=20`);
  assert.equal(prepare("scale='trunc(min(iw\\,ih)/2)*2':'trunc(min(iw\\,ih)/2)*2',drawtext=text='▶▶ 2x':fontsize=h/15"),
    `scale='trunc(min(iw\\,ih)/2)*2':'trunc(min(iw\\,ih)/2)*2',drawtext=fontfile=${OVERLAY_FONT_PATH}:text='▶▶ 2x':fontsize=h/15`);
});

test("leaves unrelated arguments alone and doesn't fetch fonts for ordinary conversion", () => {
  const args = ["-i", "input.mp4", "-metadata", "comment=drawtext=hello", "-vf", "scale=180:180,setsar=1", "output.mp4"];
  assert.deepEqual(prepareOverlayFonts(args), args);
  assert.equal(needsOverlayFont(getExecutionArgs(args)), false);
});
