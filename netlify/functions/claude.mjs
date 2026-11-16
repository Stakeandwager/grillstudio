// Serverless proxy for the Idea engine.
//
// The Anthropic key lives in the Netlify environment (ANTHROPIC_API_KEY)
// and never reaches the browser. Because this endpoint spends a paid key,
// it is locked down:
//   * same-site browser requests only (Origin must match the site, or be
//     listed in GRILLSTUDIO_ALLOWED_ORIGINS, comma-separated);
//   * strict request shape: user/assistant text messages only, size caps,
//     no client-chosen model, system prompt or tools;
//   * max_tokens capped at 1024.
// Residual risk (documented in docs/SECURITY_AND_PRIVACY.md): a non-browser
// client can forge an Origin header. Real protection needs user auth and
// per-user rate limiting, which arrive with the auth/storage milestone.

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 6000;
const MAX_TOKENS = 1024;
const DEFAULT_MODEL = "claude-sonnet-4-6";

const json = (status, message) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers: { "Content-Type": "application/json" } });

export const allowedOrigin = (req, env) => {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host;
  try {
    host = new URL(req.url).host;
  } catch {
    return false;
  }
  const extra = String(env.GRILLSTUDIO_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    return new URL(origin).host === host || extra.includes(origin);
  } catch {
    return false;
  }
};

export const validatePayload = (body) => {
  if (!body || typeof body !== "object") return "Body must be a JSON object.";
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return `messages must be a list of 1–${MAX_MESSAGES} items.`;
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return "Only user and assistant messages are allowed.";
    if (typeof m.content !== "string") return "Message content must be plain text.";
    if (m.content.length > MAX_CHARS_PER_MESSAGE) return `Each message is limited to ${MAX_CHARS_PER_MESSAGE} characters.`;
  }
  if (messages[0].role !== "user") return "The first message must come from the user.";
  return null;
};

export async function handle(req, env = process.env, fetchImpl = fetch) {
  if (req.method !== "POST") return json(405, "Method not allowed");
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return json(501, "Server key not configured");
  if (!allowedOrigin(req, env)) return json(403, "This endpoint only serves the GrillStudio site.");

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, "Request too large.");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, "Body must be valid JSON.");
  }
  const problem = validatePayload(body);
  if (problem) return json(400, problem);

  const payload = {
    model: env.GRILLSTUDIO_CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: Math.max(1, Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS)),
    messages: body.messages.map(({ role, content }) => ({ role, content })),
  };
  try {
    const upstream = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    const data = await upstream.text();
    return new Response(data, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  } catch {
    // Never echo upstream/internal error text: it can leak configuration.
    return json(502, "The AI provider could not be reached. Try again shortly.");
  }
}

export default (req) => handle(req);

export const config = { path: "/api/claude" };
