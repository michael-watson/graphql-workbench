import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["./src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  external: [
    "vscode",
    // Native modules that can't be bundled
    "node-llama-cpp",
    "@node-llama-cpp/*",
    // PGLite uses WASM binaries loaded at runtime
    "@electric-sql/pglite",
    "@electric-sql/pglite/*",
    // Optional native PostgreSQL bindings
    "pg-native",
    "pg-cloudflare",
  ],
  logLevel: "info",
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
