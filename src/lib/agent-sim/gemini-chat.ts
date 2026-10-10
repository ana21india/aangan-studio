// Minimal multi-turn Gemini client (with function calling) used only by the agent test harness.
export interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}
export interface Content {
  role: "user" | "model";
  parts: Part[];
}
export interface FunctionDecl {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export async function generate(opts: {
  model: string;
  system: string;
  contents: Content[];
  tools?: FunctionDecl[];
  json?: boolean;
  temperature?: number;
  apiKey?: string;
}): Promise<{ content: Content; usage: { input: number; output: number } }> {
  const key = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.contents,
        ...(opts.tools?.length ? { tools: [{ functionDeclarations: opts.tools }] } : {}),
        generationConfig: { temperature: opts.temperature ?? 0.3, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
      }),
    });
    if (res.ok) {
      const j = await res.json();
      const cand = j.candidates?.[0]?.content as Content | undefined;
      if (cand?.parts?.length) {
        return { content: cand, usage: { input: j.usageMetadata?.promptTokenCount ?? 0, output: (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0) } };
      }
      last = "empty response";
    } else {
      last = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status < 500 && res.status !== 429) throw new Error(`Gemini failed. ${last}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`Gemini did not answer after retries. ${last}`);
}

export const textOf = (c: Content) => c.parts.map((p) => p.text ?? "").join("").trim();
