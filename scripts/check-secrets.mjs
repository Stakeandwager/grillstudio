#!/usr/bin/env node
/* Scans source, public assets, the built bundle and docs for credentials.
   Exit code 1 on any finding. Run: npm run check:secrets */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export const PATTERNS = [
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI-style key", re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|github_pat_[A-Za-z0-9_]{50,}/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Netlify token", re: /\bnfp_[A-Za-z0-9]{30,}\b/ },
  { name: "Hard-coded key assignment", re: /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i },
];

const ROOTS = ["src", "public", "netlify", "dist", "docs", "index.html", "README.md", "netlify.toml"];
const SKIP = new Set(["node_modules", ".git"]);
const TEXT = /\.(m?js|jsx|ts|tsx|css|html|json|md|toml|txt|svg|fountain|ya?ml)$/i;

export function scanText(text) {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

function* walk(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isFile()) {
    if (TEXT.test(path) && st.size < 5_000_000) yield path;
    return;
  }
  for (const entry of readdirSync(path)) if (!SKIP.has(entry)) yield* walk(join(path, entry));
}

export function scan(root = process.cwd()) {
  const findings = [];
  for (const r of ROOTS)
    for (const file of walk(join(root, r))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const name of scanText(line)) findings.push({ file: relative(root, file), line: i + 1, name });
      });
    }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scan();
  if (findings.length) {
    for (const f of findings) console.error(`SECRET? ${f.name} at ${f.file}:${f.line}`);
    process.exit(1);
  }
  console.log("check-secrets: no credentials found in src, public, netlify, dist, docs.");
}
