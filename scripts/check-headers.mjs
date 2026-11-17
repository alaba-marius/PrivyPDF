import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Headers that must be present in both vercel.json and _headers, with the
// same value in both files. The URL mode additionally confirms the live site
// sends them (run that after deploying).
const EXPECTED = [
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
  "strict-transport-security",
  "cross-origin-opener-policy",
  "permissions-policy",
];

let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function parseHeadersFile(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z-]+):\s*(.*)$/);
    if (m) map[m[1].toLowerCase()] = m[2];
  }
  return map;
}

function parseVercelHeaders() {
  const text = readFileSync(join(ROOT, "vercel.json"), "utf8");
  const data = JSON.parse(text);
  const map = {};
  for (const entry of data.headers || []) {
    for (const h of entry.headers || []) {
      map[h.key.toLowerCase()] = h.value;
    }
  }
  return map;
}

function checkLocal() {
  const vercel = parseVercelHeaders();
  const headersFile = parseHeadersFile(readFileSync(join(ROOT, "_headers"), "utf8"));

  for (const key of EXPECTED) {
    const v = vercel[key];
    const h = headersFile[key];
    check(`${key} present in vercel.json`, v != null, v ? `"${v}"` : "<missing>");
    check(`${key} present in _headers`, h != null, h ? `"${h}"` : "<missing>");
    if (v != null && h != null) {
      check(`${key} identical in vercel.json and _headers`, h === v, `vercel="${v}" _headers="${h}"`);
    }
  }

  check(
    "x-frame-options absent in vercel.json",
    !("x-frame-options" in vercel),
    vercel["x-frame-options"] ? `present: ${vercel["x-frame-options"]}` : "",
  );
  check(
    "x-frame-options absent in _headers",
    !("x-frame-options" in headersFile),
    headersFile["x-frame-options"] ? `present: ${headersFile["x-frame-options"]}` : "",
  );

  console.log(
    failures > 0
      ? `\n${failures} check(s) failed — header files are out of sync.`
      : "\nAll header checks passed — vercel.json and _headers are in sync.",
  );
  console.log("Note: use the URL mode after deploying to confirm the live site sends these headers.");
  if (failures > 0) process.exit(1);
}

async function checkUrl(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (error) {
    console.error(`FAIL could not fetch ${url}: ${error.message}`);
    process.exit(1);
  }
  const get = (name) => res.headers.get(name);
  for (const key of EXPECTED) {
    const value = get(key);
    check(
      key,
      value != null && value.includes(EXPECTED_VALUE(key)),
      value ? `"${value}"` : "<missing>",
    );
  }
  const xfo = get("x-frame-options");
  check("x-frame-options dropped", xfo == null, xfo ? `present: ${xfo}` : "");
  if (failures > 0) process.exit(1);
}

// Expected value fragments for the URL mode (substring check against live headers).
function EXPECTED_VALUE(key) {
  const fragments = {
    "content-security-policy": "frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=63072000",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=()",
  };
  return fragments[key] || "";
}

const args = process.argv.slice(2);
if (args.includes("--local")) {
  checkLocal();
} else {
  const url = args[0];
  if (!url) {
    console.error("Usage: node scripts/check-headers.mjs <URL> | --local");
    process.exit(2);
  }
  await checkUrl(url);
}
