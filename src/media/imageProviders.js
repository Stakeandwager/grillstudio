/* ------------------------------------------------------------------ *
 * Image generation adapters — replaceable, provider-independent.
 *
 * Each adapter: generate({prompt, seed, width, height, apiKey, fetchImpl})
 *   → { kind: "url", url } | { kind: "blob", blob, mime }
 * Keys are typed by the user, held in memory only, and sent straight
 * from the browser to that provider. GrillStudio's server never sees
 * them and the owner is never billed.
 * ------------------------------------------------------------------ */

export class ProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const b64ToBlob = (b64, mime = "image/png") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const explain = async (res, provider) => {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message || j?.message || "";
  } catch {
    /* body not JSON */
  }
  if (res.status === 401 || res.status === 403) return new ProviderError(`${provider} rejected the key. Check it and that image generation is enabled on that account.`, "auth");
  if (res.status === 429) return new ProviderError(`${provider} is rate-limiting or the account is out of credit. Wait a moment, or check billing.`, "rate");
  if (res.status === 400 && /safety|policy|blocked/i.test(detail)) return new ProviderError(`${provider} refused this prompt under its content policy. Rephrase the shot description.`, "policy");
  return new ProviderError(`${provider} error ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`, "provider");
};

export const PROVIDERS = {
  pollinations: {
    label: "Pollinations (free, no key)",
    needsKey: false,
    cost: "Free. Slower, rate-limited (about one image every 5 seconds). Prompt text is sent to pollinations.ai and generated images may be public there.",
    async generate({ prompt, seed, width = 1024, height = 576 }) {
      const q = new URLSearchParams({ width, height, seed: String(seed ?? 0), nologo: "true", model: "flux" });
      return { kind: "url", url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}?${q}` };
    },
  },
  openai: {
    label: "OpenAI (your key)",
    needsKey: true,
    keyHint: "OpenAI API key (sk-…)",
    cost: "Billed to your OpenAI account per image (typically a few cents).",
    async generate({ prompt, apiKey, fetchImpl = fetch }) {
      const res = await fetchImpl("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", n: 1 }),
      });
      if (!res.ok) throw await explain(res, "OpenAI");
      const j = await res.json();
      const b64 = j?.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError("OpenAI returned no image.", "empty");
      return { kind: "blob", blob: b64ToBlob(b64), mime: "image/png" };
    },
  },
  gemini: {
    label: "Google Gemini (your key)",
    needsKey: true,
    keyHint: "Gemini API key (AIza…)",
    cost: "Image generation is a paid Gemini feature, billed to your Google account per image.",
    async generate({ prompt, apiKey, fetchImpl = fetch }) {
      const res = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
      });
      if (!res.ok) throw await explain(res, "Gemini");
      const j = await res.json();
      const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) throw new ProviderError("Gemini returned no image (it may have declined the prompt).", "empty");
      const mime = part.inlineData.mimeType || "image/png";
      return { kind: "blob", blob: b64ToBlob(part.inlineData.data, mime), mime };
    },
  },
};

export async function generateImage(providerId, args) {
  const p = PROVIDERS[providerId];
  if (!p) throw new ProviderError(`Unknown image provider "${providerId}".`, "config");
  if (p.needsKey && !String(args.apiKey || "").trim()) throw new ProviderError(`Enter your ${p.label.replace(/ \(.*/, "")} key first.`, "config");
  if (!String(args.prompt || "").trim()) throw new ProviderError("Nothing to draw: the prompt is empty.", "config");
  try {
    return await p.generate(args);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Couldn't reach ${p.label.replace(/ \(.*/, "")}. Check your connection and try again.`, "network");
  }
}
