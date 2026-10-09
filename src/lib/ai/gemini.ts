import type { z } from "zod";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GeminiResult<T> {
  data: T;
  usage: Usage;
}

// Minimal Gemini REST client. Used only after the call, never during it.
export async function generateJson<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  opts: { apiKey?: string; model?: string; retries?: number } = {},
): Promise<GeminiResult<T>> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const maxAttempts = (opts.retries ?? 2) + 1;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = attempt === 1 ? user : `${user}\n\nYour previous reply was invalid (${lastError}). Reply again with valid JSON only.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      lastError = `HTTP ${res.status}: ${body}`;
      if (res.status >= 500 || res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw new Error(`Gemini request failed. ${lastError}`);
    }
    const json = await res.json();
    const meta = json.usageMetadata ?? {};
    usage.inputTokens += meta.promptTokenCount ?? 0;
    usage.outputTokens += (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);

    const text: string | undefined = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) {
      lastError = "empty response";
      continue;
    }
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return { data: parsed.data, usage };
      lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastError = "not valid JSON";
    }
  }
  throw new Error(`Gemini did not return valid output after ${maxAttempts} attempts: ${lastError}`);
}
