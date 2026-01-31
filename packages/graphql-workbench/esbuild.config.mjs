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
    // PGLite native bindings
    "@electric-sql/pglite",
    "@electric-sql/pglite/*",
    // PostgreSQL native bindings
    "pg",
    "pg-native",
    "pg-cloudflare",
    // Keep graphql external to avoid version conflicts
    "graphql",
    // Local workspace packages - must be external to support ESM
    "graphql-embedding",
    "graphql-embedding-core",
    "graphql-embedding-parser",
    "graphql-embedding-operation",
    "graphql-embedding-schema-design",
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
