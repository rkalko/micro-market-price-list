#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const explicitUrl = process.argv[2];
const pagesUrl = explicitUrl && /^https?:\/\/\S+$/i.test(explicitUrl)
  ? normalizeUrl(explicitUrl)
  : inferPagesUrl();

if (!pagesUrl) {
  console.error("Could not infer GitHub Pages URL.");
  console.error("Use: npm run finalize -- https://USER.github.io/REPO/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["scripts/generate-qr.js", pagesUrl], {
  cwd: resolve("."),
  encoding: "utf8",
  stdio: "pipe"
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}

mkdirSync("qr", { recursive: true });
writeFileSync("qr/pages-url.txt", `${pagesUrl}\n`);

process.stdout.write(result.stdout);
console.log(`Pages URL saved to ${resolve("qr/pages-url.txt")}`);

function inferPagesUrl() {
  let remote = "";
  try {
    remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8"
    }).trim();
  } catch {
    return "";
  }

  const match = remote.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/i);
  if (!match?.groups) return "";

  const owner = match.groups.owner;
  const repo = match.groups.repo.replace(/\.git$/i, "");
  if (repo.toLocaleLowerCase("en-US") === `${owner}.github.io`.toLocaleLowerCase("en-US")) {
    return `https://${owner}.github.io/`;
  }

  return `https://${owner}.github.io/${repo}/`;
}

function normalizeUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
