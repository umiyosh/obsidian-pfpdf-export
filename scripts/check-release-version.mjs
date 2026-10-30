#!/usr/bin/env node
// Run by the release workflow: the tag, manifest.json, package.json and versions.json must agree,
// because Obsidian installs the release whose tag equals manifest.json's version.
// Usage: node scripts/check-release-version.mjs <tag>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function releaseVersionErrors({ tag, manifest, pkg, versions }) {
  if (!/^\d+\.\d+\.\d+$/.test(tag)) return [`Tag "${tag}" must be x.y.z, without a "v" prefix.`];
  const errors = [];
  for (const [file, version] of [
    ["manifest.json", manifest.version],
    ["package.json", pkg.version],
  ]) {
    if (version !== tag) errors.push(`${file} version "${version}" does not match tag "${tag}".`);
  }
  if (!(tag in versions)) {
    errors.push(`versions.json has no entry for "${tag}".`);
  } else if (versions[tag] !== manifest.minAppVersion) {
    errors.push(
      `versions.json maps "${tag}" to "${versions[tag]}", but manifest.json minAppVersion is "${manifest.minAppVersion}".`
    );
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = (file) => JSON.parse(readFileSync(file, "utf8"));
  const errors = releaseVersionErrors({
    tag: process.argv[2] ?? "",
    manifest: read("manifest.json"),
    pkg: read("package.json"),
    versions: read("versions.json"),
  });
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exit(errors.length === 0 ? 0 : 1);
}
