import fs from "node:fs";
import path from "node:path";

const webRoot = path.resolve("android/app/src/main/assets/public");
const manifestPath = path.join(webRoot, "asset-manifest.json");
const localOrigin = "https://capacitor-assets.invalid";
const preservedRootFiles = new Set([
  "LICENSE",
  "ads.txt",
  "asset-manifest.json",
  "cordova.js",
  "cordova_plugins.js",
  "index.html",
  "privacy-policy.html",
  "robots.txt",
  "terms-of-service.html",
  "version.txt",
]);

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing Android asset manifest: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
  string,
  string
>;
const referencedFiles = new Set<string>();

for (const assetUrl of Object.values(manifest)) {
  if (typeof assetUrl !== "string") continue;
  const url = new URL(assetUrl, localOrigin);
  if (url.origin !== localOrigin) continue;

  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const normalizedPath = path.posix.normalize(relativePath);
  if (
    normalizedPath !== relativePath ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../")
  ) {
    throw new Error(`Invalid asset path in manifest: ${assetUrl}`);
  }
  referencedFiles.add(normalizedPath);
}

let removedFiles = 0;
let removedBytes = 0;

function pruneDirectory(directory: string, relativeDirectory = "") {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      pruneDirectory(absolutePath, relativePath);
      if (fs.readdirSync(absolutePath).length === 0) {
        fs.rmdirSync(absolutePath);
      }
    } else if (
      !referencedFiles.has(relativePath) &&
      !preservedRootFiles.has(relativePath)
    ) {
      removedBytes += fs.statSync(absolutePath).size;
      fs.unlinkSync(absolutePath);
      removedFiles++;
    }
  }
}

pruneDirectory(webRoot);

console.log(
  `Removed ${removedFiles} unreferenced Android web assets (${(removedBytes / 1024 / 1024).toFixed(1)} MiB); all current manifest assets were retained.`,
);
