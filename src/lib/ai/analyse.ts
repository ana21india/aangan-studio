import { ExtractedFields, Assessment } from "../scoring/types";
import { ASSESS_SYSTEM, EXTRACT_SYSTEM } from "./prompts";
import { generateJson, type Usage } from "./gemini";

export interface Analysis {
  fields: ExtractedFields;
  assessment: Assessment;
  usage: Usage;
}

export interface KnowledgeDocs {
  services: string;
  qualified: string;
}

// Step 1 extracts facts, step 2 judges the criteria. Both are separate Gemini calls.
export async function analyseTranscript(
  transcript: string,
  callDate: Date,
  docs: KnowledgeDocs,
  opts: { apiKey?: string; model?: string } = {},
): Promise<Analysis> {
  const date = callDate.toISOString().slice(0, 10);

  const extracted = await generateJson(
    ExtractedFields,
    EXTRACT_SYSTEM,
    `Call date: ${date}\n\nTranscript:\n${transcript}`,
    opts,
  );

  const assessed = await generateJson(
    Assessment,
    ASSESS_SYSTEM,
    [
      `Call date: ${date}`,
      `=== SERVICES DOCUMENT ===\n${docs.services}`,
      `=== FOUNDER'S RUBRIC ===\n${docs.qualified}`,
      `=== EXTRACTED FACTS ===\n${JSON.stringify(extracted.data, null, 2)}`,
      `=== TRANSCRIPT ===\n${transcript}`,
    ].join("\n\n"),
    opts,
  );

  return {
    fields: extracted.data,
    assessment: assessed.data,
    usage: {
      inputTokens: extracted.usage.inputTokens + assessed.usage.inputTokens,
      outputTokens: extracted.usage.outputTokens + assessed.usage.outputTokens,
    },
  };
}
