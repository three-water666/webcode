import { readFileSync, writeFileSync } from "node:fs";

const [rawVersion, outputPath = "release-notes.md"] = process.argv.slice(2);

if (!rawVersion) {
  console.error("Usage: node .github/scripts/extract-release-notes.mjs <version-or-tag> [output-path]");
  process.exit(1);
}

const version = rawVersion.replace(/^refs\/tags\//, "").replace(/^v/, "");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(filePath) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const headerPattern = new RegExp(`^##\\s+v?${escapeRegExp(version)}(?:\\s|$)`);
  const startIndex = lines.findIndex((line) => headerPattern.test(line));

  if (startIndex === -1) {
    throw new Error(`Could not find v${version} in ${filePath}`);
  }

  const sectionLines = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "---" || /^##\s+v?\d/.test(line)) {
      break;
    }
    sectionLines.push(line);
  }

  const section = sectionLines.join("\n").trim();
  if (!section) {
    throw new Error(`Found v${version} in ${filePath}, but the section is empty`);
  }

  return section;
}

const englishNotes = extractSection("CHANGELOG.md");
const chineseNotes = extractSection("CHANGELOG_zh.md");
const releaseNotes = `# webcode ${version}

## English
${englishNotes}

## 中文
${chineseNotes}
`;

writeFileSync(outputPath, releaseNotes);
