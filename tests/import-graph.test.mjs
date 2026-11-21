// Static import-graph check: every module reachable from editor.js through
// static import statements must resolve to an existing file, and every named
// import must be exported by its target module (locally or through a
// re-export chain). Dynamic imports of vendored bundles are deliberately out
// of scope here — they are covered by tests/loader-contract.test.mjs.
//
// This test fails when a module imports something that does not exist (for
// example buildSkeletons missing from js/ui/cards.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "js", "editor.js");

function stripComments(code) {
  return code.replace(/\/\/[^\n\r]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// Resolve an import specifier the way a browser module graph would: relative
// to the importing file, or from the repo root when it starts with "/".
function resolveSpec(spec, fromFile) {
  if (spec.startsWith(".")) return resolve(dirname(fromFile), spec);
  if (spec.startsWith("/")) return join(ROOT, spec.slice(1));
  return null; // bare specifiers (node:, npm packages) are not part of this graph
}

function importStatements(code) {
  const out = [];
  for (const m of stripComments(code).matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)["']([^"']+)["']/g)) {
    out.push({ namesClause: m[1], spec: m[2] });
  }
  return out;
}

// Named bindings of one import clause: { a, b } → ["a", "b"]. Default and
// namespace imports carry no named bindings.
function namedBindings(clause) {
  if (!clause) return [];
  if (clause.trim().startsWith("{")) {
    return [
      ...clause.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?\s*,?/g),
    ].map((m) => m[1]);
  }
  return [];
}

// Locally declared exports of one module: export function/const/let/class and
// export { a, b } lists.
function localExports(code) {
  const names = new Set();
  const cleaned = stripComments(code);
  for (const m of cleaned.matchAll(
    /(?:^|\n)\s*export\s+(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)|let\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/g
  )) {
    names.add(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
  }
  for (const m of cleaned.matchAll(/export\s*\{\s*([\s\S]*?)\s*\}/g)) {
    for (const nm of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?\s*,?/g)) {
      names.add(nm[1]);
    }
  }
  return names;
}

function reexportSpecs(code) {
  const out = [];
  for (const m of stripComments(code).matchAll(/export\s*\{\s*[\s\S]*?\}\s+from\s+["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  return out;
}

const modules = new Map(); // abs path -> { imports, local, reexports }
function moduleOf(absPath) {
  let entry = modules.get(absPath);
  if (!entry) {
    entry = {
      imports: importStatements(readFileSync(absPath, "utf8")),
      local: localExports(readFileSync(absPath, "utf8")),
      reexports: reexportSpecs(readFileSync(absPath, "utf8")),
    };
    modules.set(absPath, entry);
  }
  return entry;
}

const transitiveExports = new Map();
function allExports(absPath, seen = new Set()) {
  if (transitiveExports.has(absPath)) return transitiveExports.get(absPath);
  if (seen.has(absPath)) return new Set();
  seen.add(absPath);
  const entry = moduleOf(absPath);
  const out = new Set(entry.local);
  for (const spec of entry.reexports) {
    const target = resolveSpec(spec, absPath);
    if (target) for (const name of allExports(target, seen)) out.add(name);
  }
  transitiveExports.set(absPath, out);
  return out;
}

test("every module reachable from editor.js exists and exports every named import", (t) => {
  const reachable = new Set([ENTRY]);
  const queue = [ENTRY];
  while (queue.length) {
    const file = queue.shift();
    for (const imp of moduleOf(file).imports) {
      const target = resolveSpec(imp.spec, file);
      assert.ok(target, `unresolvable static import ${JSON.stringify(imp.spec)} in ${file}`);
      assert.ok(
        existsSync(target),
        `static import ${JSON.stringify(imp.spec)} in ${file} points at a missing file ${target}`,
      );
      if (!reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }

  for (const file of [...reachable].sort()) {
    for (const imp of moduleOf(file).imports) {
      const target = resolveSpec(imp.spec, file);
      for (const name of namedBindings(imp.namesClause)) {
        assert.ok(
          allExports(target).has(name),
          `${file} imports ${JSON.stringify(name)} from ${JSON.stringify(imp.spec)}, but ${target} does not export it`,
        );
      }
    }
  }
});

test("js/ui/cards.js exports buildSkeletons so the editor shell mounts", () => {
  assert.ok(allExports(join(ROOT, "js", "ui", "cards.js")).has("buildSkeletons"));
  assert.ok(allExports(join(ROOT, "js", "ui", "cards.js")).has("mountGrid"));
});
