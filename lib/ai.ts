// Claude, for the few dashboard features that write text (review replies).
// The key is Scalar's (ANTHROPIC_API_KEY in Vercel), so every use is capped
// per client per day (migration 067). ANTHROPIC_MODEL picks the model;
// left unset, the newest Haiku the key can see - fast and cheap for short text.

const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";
let cachedModel: string | null = null;

export class AIUnavailable extends Error {}

function headers(key: string) {
  return { "x-api-key": key, "anthropic-version": VERSION, "content-type": "application/json" };
}

/** Newest Haiku, else newest Sonnet, else the newest model. */
export function pickModel(models: { id: string; created_at?: string }[]): string | null {
  const newest = [...models].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return newest.find((m) => m.id.includes("haiku"))?.id ?? newest.find((m) => m.id.includes("sonnet"))?.id ?? newest[0]?.id ?? null;
}

async function model(key: string): Promise<string> {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  if (cachedModel) return cachedModel;
  const res = await fetch(`${API}/models?limit=100`, { headers: headers(key) });
  if (!res.ok) throw new AIUnavailable(`Anthropic refused the key (HTTP ${res.status})`);
  const picked = pickModel(((await res.json()) as { data?: { id: string; created_at?: string }[] }).data ?? []);
  if (!picked) throw new AIUnavailable("The Anthropic key can't see any models");
  cachedModel = picked;
  return picked;
}

export async function askClaude(prompt: string, maxTokens = 400): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AIUnavailable("ANTHROPIC_API_KEY isn't set in Vercel");
  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ model: await model(key), max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new AIUnavailable(`Claude didn't answer (HTTP ${res.status})`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (body.content ?? []).map((b) => b.text ?? "").join("").trim();
}
