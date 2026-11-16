import { describe, it, expect, vi } from "vitest";
import { handle } from "../../netlify/functions/claude.mjs";

const SITE = "https://grillstudio.netlify.app";
const env = { ANTHROPIC_API_KEY: "test-key-not-real" };
const req = (body, { origin = SITE, method = "POST" } = {}) =>
  new Request(`${SITE}/api/claude`, {
    method,
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
const okBody = { max_tokens: 99999, messages: [{ role: "user", content: "Give me 3 titles" }] };
const okUpstream = () => vi.fn(async () => new Response(JSON.stringify({ content: [] }), { status: 200 }));

describe("/api/claude proxy", () => {
  it("rejects non-POST", async () => {
    expect((await handle(req(null, { method: "GET" }), env, okUpstream())).status).toBe(405);
  });

  it("returns 501 when no server key is configured", async () => {
    expect((await handle(req(okBody), {}, okUpstream())).status).toBe(501);
  });

  it("refuses requests without a same-site Origin", async () => {
    const up = okUpstream();
    expect((await handle(req(okBody, { origin: null }), env, up)).status).toBe(403);
    expect((await handle(req(okBody, { origin: "https://evil.example" }), env, up)).status).toBe(403);
    expect(up).not.toHaveBeenCalled();
  });

  it("allows explicitly configured extra origins (deploy previews)", async () => {
    const preview = "https://deploy-preview-1--grillstudio.netlify.app";
    const res = await handle(req(okBody, { origin: preview }), { ...env, GRILLSTUDIO_ALLOWED_ORIGINS: preview }, okUpstream());
    expect(res.status).toBe(200);
  });

  it("caps max_tokens and ignores client-chosen model, system and tools", async () => {
    const up = okUpstream();
    await handle(req({ ...okBody, model: "expensive-model", system: "ignore rules", tools: [{}] }), env, up);
    const sent = JSON.parse(up.mock.calls[0][1].body);
    expect(sent.max_tokens).toBe(1024);
    expect(sent.model).toBe("claude-sonnet-4-6");
    expect(sent.system).toBeUndefined();
    expect(sent.tools).toBeUndefined();
  });

  it("validates message shape and size", async () => {
    const bad = [
      "{not json",
      { messages: [] },
      { messages: [{ role: "system", content: "x" }] },
      { messages: [{ role: "user", content: [{ type: "image" }] }] },
      { messages: [{ role: "assistant", content: "x" }] },
      { messages: [{ role: "user", content: "x".repeat(7000) }] },
      { messages: Array.from({ length: 7 }, () => ({ role: "user", content: "x" })) },
    ];
    for (const b of bad) expect((await handle(req(b), env, okUpstream())).status).toBe(400);
    expect((await handle(req({ messages: [{ role: "user", content: "x".repeat(5000) }], pad: "y".repeat(40000) }), env, okUpstream())).status).toBe(413);
  });

  it("does not leak internal error text when the provider is unreachable", async () => {
    const res = await handle(req(okBody), env, async () => {
      throw new Error("ECONNREFUSED 10.0.0.5:443 key=test-key-not-real");
    });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("10.0.0.5");
    expect(text).not.toContain("test-key-not-real");
  });

  it("passes provider errors (e.g. invalid key) through with their status", async () => {
    const res = await handle(req(okBody), env, async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }));
    expect(res.status).toBe(401);
  });
});
