import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
for (const variant of ["core", "core-mt"]) {
  const source = dirname(require.resolve(`@ffmpeg/${variant}`));
  // Next's FFmpeg wrapper uses a module worker, which needs the ESM core.
  const esm = join(source, "../esm");
  const target = new URL(`../public/ffmpeg/0.12.10/${variant}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm", ...(variant === "core-mt" ? ["ffmpeg-core.worker.js"] : [])]) {
    await copyFile(join(esm, file), new URL(file, target));
  }
}
// Serve the wrapper worker unbundled too: Turbopack rewrites its dynamic core
// import into a throwing stub ("Cannot find module as expression is too dynamic").
const wrapperSource = join(dirname(require.resolve("@ffmpeg/ffmpeg")), "../esm");
const wrapperTarget = new URL("../public/ffmpeg/0.12.10/wrapper-0.12.15/", import.meta.url);
await mkdir(wrapperTarget, { recursive: true });
for (const file of ["worker.js", "const.js", "errors.js"]) {
  await copyFile(join(wrapperSource, file), new URL(file, wrapperTarget));
}
const fontSource = dirname(require.resolve("dejavu-fonts-ttf/package.json"));
const fontTarget = new URL("../public/ffmpeg/0.12.10/fonts/dejavu-2.37/", import.meta.url);
await mkdir(fontTarget, { recursive: true });
await copyFile(join(fontSource, "ttf/DejaVuSans.ttf"), new URL("DejaVuSans.ttf", fontTarget));
await copyFile(join(fontSource, "LICENSE"), new URL("LICENSE", fontTarget));
console.log("FFmpeg assets and overlay font copied to public/ffmpeg/0.12.10");
