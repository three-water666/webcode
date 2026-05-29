import { uniqueStrings } from "./charUtils";
import { normalizeLooseJsonSyntax } from "./looseSyntax";
import { repairModelJson } from "./repair";

const NON_STANDARD_SPACES = /[\u00a0\uFEFF\u200B]/g;

export function normalizeModelJson(text: string): string {
  return text.replace(NON_STANDARD_SPACES, " ");
}

export function buildRepairCandidates(text: string): string[] {
  const extracted = extractJsonCandidate(text);
  const bases = uniqueStrings([text, extracted]);
  const candidates: string[] = [];

  for (const base of bases) {
    const loose = normalizeLooseJsonSyntax(base);
    candidates.push(base, loose, repairModelJson(base), repairModelJson(loose));
  }

  return uniqueStrings(candidates).filter((candidate) => candidate !== text);
}

function extractJsonCandidate(text: string): string {
  const trimmed = stripMarkdownFence(text.trim());
  const actionIndex = trimmed.search(/["'\u201C\u201D]?mcp_action["'\u201C\u201D]?/);
  const fallbackStart = findFirstJsonStart(trimmed);
  const start = actionIndex >= 0 ? trimmed.lastIndexOf("{", actionIndex) : fallbackStart;
  if (start < 0) {
    return trimmed;
  }

  const opening = trimmed[start];
  const closing = opening === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(closing);
  return end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
}

function stripMarkdownFence(text: string): string {
  if (!text.startsWith("```")) {
    return text;
  }

  const firstLineEnd = text.indexOf("\n");
  if (firstLineEnd < 0) {
    return text;
  }

  const withoutOpeningFence = text.slice(firstLineEnd + 1);
  const closingFenceIndex = withoutOpeningFence.lastIndexOf("```");
  return closingFenceIndex >= 0 ? withoutOpeningFence.slice(0, closingFenceIndex).trim() : withoutOpeningFence.trim();
}

function findFirstJsonStart(text: string): number {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  if (objectStart < 0) {
    return arrayStart;
  }
  if (arrayStart < 0) {
    return objectStart;
  }

  return Math.min(objectStart, arrayStart);
}
