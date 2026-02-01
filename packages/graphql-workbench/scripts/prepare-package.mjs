/**
 * Packages the VS Code extension from a staging directory.
 *
 * In an npm workspace, dependencies are hoisted to the root node_modules
 * and workspace packages are symlinks. vsce cannot follow symlinks outside
 * the extension directory. To work around this, this script:
 *
 * 1. Creates a staging directory outside the workspace
 * 2. Copies extension source files and built output
 * 3. Copies production dependencies (resolving symlinks) into a local node_modules,
 *    excluding build-only transitive dependencies
 * 4. Prunes large files not needed at runtime (llama.cpp source bundle,
 *    unused PGLite extensions, CLI code, etc.)
 * 5. Runs vsce package from the staging directory
 * 6. Copies the resulting VSIX back
 *
 * Note: The embedding model is downloaded on first use by the extension
 * and is no longer bundled in the VSIX.
 */

import { execSync } from "child_process";
import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir, platform, arch } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const monorepoRoot = resolve(pkgRoot, "..", "..");
const rootNodeModules = join(monorepoRoot, "node_modules");

// Packages excluded from the VSIX. Only packages that are NOT reachable via
// static ESM imports from node-llama-cpp's main entry point (dist/index.js).
//
// IMPORTANT: node-llama-cpp uses static ESM imports, so most of its declared
// dependencies ARE loaded at module init time even if only used in certain code
// paths. Only exclude packages confirmed unreachable from the main entry.
const EXCLUDED_PACKAGES = new Set([
  // TypeScript compiler — not imported by any runtime code
  "typescript",
  // Native addon build tooling — only invoked by npm install / build scripts
  "cmake-js",
  "node-addon-api",
  "node-api-headers",
  "@reflink/reflink",
  "@reflink/reflink-darwin-arm64",
  "@reflink/reflink-darwin-x64",
  "@reflink/reflink-linux-arm64-gnu",
  "@reflink/reflink-linux-arm64-musl",
  "@reflink/reflink-linux-x64-gnu",
  "@reflink/reflink-linux-x64-musl",
  "@reflink/reflink-win32-arm64-msvc",
  "@reflink/reflink-win32-x64-msvc",
  // --- Transitive deps exclusive to cmake-js (not shared with runtime deps) ---
  // cmake-js → axios
  "axios",
  "follow-redirects",
  "proxy-from-env",
  "form-data",
  "combined-stream",
  "delayed-stream",
  "asynckit",
  "mime-types",
  "mime-db",
  // cmake-js → memory-stream
  "memory-stream",
  // cmake-js → npmlog
  "npmlog",
  "gauge",
  "are-we-there-yet",
  "aproba",
  "has-unicode",
  "wide-align",
  "set-blocking",
  "console-control-strings",
  "color-support",
  "delegates",
  "readable-stream",
  "string_decoder",
  "util-deprecate",
  "safe-buffer",
  "inherits",
  // cmake-js → rc
  "rc",
  "deep-extend",
  "ini",
  "strip-json-comments",
  "minimist",
  // cmake-js → tar
  "tar",
  "minipass",
  "minizlib",
  "yallist",
  "mkdirp",
  "fs-minipass",
  "chownr",
  // cmake-js → url-join
  "url-join",
]);

// --- Platform-specific VSIX support ---
// Pass --target <platform> to build a platform-specific VSIX containing only
// the matching @node-llama-cpp/* native binary. Without --target, the current
// platform is detected automatically (for local development builds).
const targetArgIdx = process.argv.indexOf("--target");
const vsceTarget = targetArgIdx !== -1 ? process.argv[targetArgIdx + 1] : null;

// Maps VS Code platform targets to @node-llama-cpp/* binary package names.
// Unsupported targets (not listed here):
//   alpine-x64, alpine-arm64 — node-llama-cpp ships glibc binaries only
//   web — requires native Node.js modules
const PLATFORM_BINARY_MAP = {
  "darwin-arm64": "@node-llama-cpp/mac-arm64-metal",
  "darwin-x64": "@node-llama-cpp/mac-x64",
  "linux-x64": "@node-llama-cpp/linux-x64",
  "linux-arm64": "@node-llama-cpp/linux-arm64",
  "linux-armhf": "@node-llama-cpp/linux-armv7l",
  "win32-x64": "@node-llama-cpp/win-x64",
  "win32-arm64": "@node-llama-cpp/win-arm64",
};

const effectiveTarget = vsceTarget || `${platform()}-${arch()}`;
const includedPlatformPkg = PLATFORM_BINARY_MAP[effectiveTarget] || null;

if (includedPlatformPkg) {
  console.log(`Target: ${effectiveTarget} → including ${includedPlatformPkg}`);
} else {
  console.warn(`Warning: no binary mapping for target "${effectiveTarget}"`);
}

// Create staging directory
const stagingDir = join(tmpdir(), `graphql-workbench-package-${Date.now()}`);
mkdirSync(stagingDir, { recursive: true });
console.log(`Staging directory: ${stagingDir}`);

try {
  // Copy extension files (not node_modules, not models, not scripts)
  const filesToCopy = [
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    ".vscodeignore",
  ];

  for (const file of filesToCopy) {
    const src = join(pkgRoot, file);
    if (existsSync(src)) {
      if (file === "package.json") {
        // Remove vscode:prepublish since the build is already done
        const pkg = JSON.parse(readFileSync(src, "utf8"));
        delete pkg.scripts["vscode:prepublish"];
        writeFileSync(join(stagingDir, file), JSON.stringify(pkg, null, 2) + "\n");
      } else {
        cpSync(src, join(stagingDir, file));
      }
    }
  }

  const dirsToCopy = ["dist", "docs", "images"];
  for (const dir of dirsToCopy) {
    const src = join(pkgRoot, dir);
    if (existsSync(src)) {
      cpSync(src, join(stagingDir, dir), { recursive: true });
    }
  }

  // Copy files from workspace packages that are referenced at runtime via
  // __dirname-relative paths in the esbuild bundle (not bundled as JS).
  const bestPracticesSrc = join(
    monorepoRoot,
    "packages",
    "graphql-embedding-schema-design",
    "graphql-schema-design-best-practices.md"
  );
  if (existsSync(bestPracticesSrc)) {
    cpSync(bestPracticesSrc, join(stagingDir, "graphql-schema-design-best-practices.md"));
    console.log("Copied graphql-schema-design-best-practices.md.");
  } else {
    console.warn("Warning: graphql-schema-design-best-practices.md not found.");
  }

  // Get production dependency paths
  const output = execSync("npm ls --omit=dev --parseable --all", {
    cwd: pkgRoot,
    encoding: "utf8",
  });

  const depPaths = output
    .trim()
    .split("\n")
    .filter((line) => line && !line.endsWith("/graphql-workbench"));

  console.log(`Copying ${depPaths.length} production dependencies...`);

  const stagingNodeModules = join(stagingDir, "node_modules");
  mkdirSync(stagingNodeModules, { recursive: true });

  let copiedCount = 0;
  let skippedCount = 0;

  for (const depPath of depPaths) {
    // Compute the relative path within node_modules
    const idx = depPath.indexOf("/node_modules/");
    if (idx === -1) continue;

    // Handle nested node_modules (e.g., cmake-js/node_modules/which)
    // by extracting the full relative path from the first node_modules segment
    const afterNodeModules = depPath.slice(idx + "/node_modules/".length);

    // Determine the top-level package name (handles scoped packages)
    const topLevelPkg = afterNodeModules.split("/node_modules/")[0];
    const pkgName = topLevelPkg.startsWith("@")
      ? topLevelPkg.split("/").slice(0, 2).join("/")
      : topLevelPkg.split("/")[0];

    // Skip build-only dependencies
    if (EXCLUDED_PACKAGES.has(pkgName)) {
      skippedCount++;
      continue;
    }

    // Skip @node-llama-cpp/* platform binary packages that don't match the
    // target. Only the target platform's native binary is included; all others
    // (including CUDA/Vulkan variants) are excluded.
    if (pkgName.startsWith("@node-llama-cpp/")) {
      if (pkgName !== includedPlatformPkg) {
        skippedCount++;
        continue;
      }
    }

    // Skip workspace package symlinks (they are bundled by esbuild)
    const srcInRoot = join(rootNodeModules, topLevelPkg);
    try {
      if (lstatSync(srcInRoot).isSymbolicLink()) {
        continue;
      }
    } catch {
      // Not in root node_modules, might be nested — continue with copy
    }

    const destPath = join(stagingNodeModules, afterNodeModules);
    mkdirSync(dirname(destPath), { recursive: true });

    try {
      cpSync(depPath, destPath, { recursive: true, dereference: true });
      copiedCount++;
    } catch (err) {
      console.warn(`  Warning: could not copy ${afterNodeModules}: ${err.message}`);
    }
  }

  console.log(`Dependencies copied (${copiedCount} included, ${skippedCount} excluded).`);

  // Ensure the target platform's binary package is present in staging.
  // For cross-platform builds (e.g., building darwin-arm64 on a Linux CI runner),
  // the package won't be locally installed, so download it from the npm registry.
  if (includedPlatformPkg) {
    const [scope, name] = includedPlatformPkg.split("/");
    const platformPkgDir = join(stagingNodeModules, scope, name);
    if (!existsSync(platformPkgDir)) {
      const llamaSrcPkg = JSON.parse(readFileSync(
        join(rootNodeModules, "node-llama-cpp", "package.json"), "utf8"
      ));
      const version = llamaSrcPkg.optionalDependencies?.[includedPlatformPkg];
      if (version) {
        console.log(`Downloading ${includedPlatformPkg}@${version} from npm registry...`);
        mkdirSync(platformPkgDir, { recursive: true });
        execSync(
          `curl -sL "https://registry.npmjs.org/${scope}/${name}/-/${name}-${version}.tgz" | tar xz --strip-components=1 -C "${platformPkgDir}"`,
          { stdio: "inherit" }
        );
        console.log(`Downloaded ${includedPlatformPkg}@${version}.`);
      } else {
        console.warn(`Warning: could not determine version for ${includedPlatformPkg}`);
      }
    } else {
      console.log(`Platform binary ${includedPlatformPkg} already present from local install.`);
    }
  }

  // --- Prune large files not needed at runtime ---

  // 1. node-llama-cpp/llama: remove source bundle, cmake files, C++ source, etc.
  //    Keep only small metadata files needed at runtime (binariesGithubRelease.json,
  //    llama.cpp.info.json, package.json).
  const llamaLlamaDir = join(stagingNodeModules, "node-llama-cpp", "llama");
  if (existsSync(llamaLlamaDir)) {
    const keepFiles = new Set([
      "binariesGithubRelease.json",
      "llama.cpp.info.json",
      "package.json",
    ]);
    let llamaPruned = 0;
    for (const entry of readdirSync(llamaLlamaDir)) {
      if (!keepFiles.has(entry)) {
        const entryPath = join(llamaLlamaDir, entry);
        rmSync(entryPath, { recursive: true, force: true });
        llamaPruned++;
      }
    }
    console.log(`Pruned ${llamaPruned} entries from node-llama-cpp/llama/ (kept metadata files).`);
  }

  // 2. node-llama-cpp/templates: project templates not used by the extension
  const llamaTemplatesDir = join(stagingNodeModules, "node-llama-cpp", "templates");
  if (existsSync(llamaTemplatesDir)) {
    rmSync(llamaTemplatesDir, { recursive: true, force: true });
    console.log("Pruned node-llama-cpp/templates/.");
  }

  // 3. node-llama-cpp/bins: prebuilt binaries downloaded by postinstall.
  //    On CI these can be very large (CUDA variants). The extension lets
  //    node-llama-cpp download the correct binary at runtime instead.
  const llamaBinsDir = join(stagingNodeModules, "node-llama-cpp", "bins");
  if (existsSync(llamaBinsDir)) {
    rmSync(llamaBinsDir, { recursive: true, force: true });
    console.log("Pruned node-llama-cpp/bins/.");
  }

  // 4. @electric-sql/pglite: remove unused extension .tar.gz files (keep only vector)
  const pgliteDistDir = join(
    stagingNodeModules,
    "@electric-sql",
    "pglite",
    "dist"
  );
  if (existsSync(pgliteDistDir)) {
    const keepExtensions = new Set(["vector.tar.gz"]);
    let pglitePruned = 0;
    for (const entry of readdirSync(pgliteDistDir)) {
      if (entry.endsWith(".tar.gz") && !keepExtensions.has(entry)) {
        rmSync(join(pgliteDistDir, entry));
        pglitePruned++;
      }
    }
    console.log(
      `Pruned ${pglitePruned} unused PGLite extensions (kept vector).`
    );
  }

  // Patch staged node-llama-cpp/package.json to remove excluded and platform
  // dependencies. This prevents vsce's npm-list validation from flagging them
  // as missing.
  const llamaPkgPath = join(stagingNodeModules, "node-llama-cpp", "package.json");
  if (existsSync(llamaPkgPath)) {
    const llamaPkg = JSON.parse(readFileSync(llamaPkgPath, "utf8"));
    let removedCount = 0;
    if (llamaPkg.dependencies) {
      for (const dep of Object.keys(llamaPkg.dependencies)) {
        if (EXCLUDED_PACKAGES.has(dep)) {
          delete llamaPkg.dependencies[dep];
          removedCount++;
        }
      }
    }
    // Remove optionalDependencies that aren't included in this build.
    // Only the target platform's binary is kept.
    if (llamaPkg.optionalDependencies) {
      for (const dep of Object.keys(llamaPkg.optionalDependencies)) {
        if (dep !== includedPlatformPkg) {
          delete llamaPkg.optionalDependencies[dep];
          removedCount++;
        }
      }
      if (Object.keys(llamaPkg.optionalDependencies).length === 0) {
        delete llamaPkg.optionalDependencies;
      }
    }
    writeFileSync(llamaPkgPath, JSON.stringify(llamaPkg, null, 2) + "\n");
    console.log(`Patched node-llama-cpp/package.json (removed ${removedCount} build-only/platform deps).`);
  }

  // Run vsce package from the staging directory
  const vsceCmd = vsceTarget
    ? `npx @vscode/vsce package --target ${vsceTarget}`
    : "npx @vscode/vsce package";
  console.log(`Running: ${vsceCmd}`);
  execSync(vsceCmd, {
    cwd: stagingDir,
    stdio: "inherit",
  });

  // Copy the VSIX back
  const vsixFiles = readdirSync(stagingDir).filter((f) => f.endsWith(".vsix"));
  for (const vsix of vsixFiles) {
    cpSync(join(stagingDir, vsix), join(pkgRoot, vsix));
    console.log(`Created: ${vsix}`);
  }
} finally {
  // Clean up staging directory
  rmSync(stagingDir, { recursive: true, force: true });
  console.log("Staging directory cleaned up.");
}
