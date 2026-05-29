import { buildRepairCandidates, normalizeModelJson } from "./candidates";

export { normalizeModelJson } from "./candidates";
export { repairModelJson } from "./repair";

export function parseModelJson<T = unknown>(text: string): T {
  const normalized = normalizeModelJson(text);

  try {
    return JSON.parse(normalized) as T;
  } catch (strictError) {
    for (const repaired of buildRepairCandidates(normalized)) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        // Keep the original parse error because it points at the raw model output.
      }
    }

    throw strictError;
  }
}
