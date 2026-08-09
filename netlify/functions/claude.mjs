// Serverless proxy for the Idea engine.
// The Anthropic API key lives here as an environment variable (ANTHROPIC_API_KEY)
// set in the Netlify dashboard — it never reaches the browser.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: { message: "Server key not configured" } }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }
  try {
    const body = await req.json();
    // Only allow what the Idea engine actually needs
    const payload = {
      model: "claude-sonnet-4-6",
      max_tokens: Math.min(Number(body.max_tokens) || 1024, 2048),
      messages: body.messages,
    };
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: err.message || "Proxy error" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/claude" };
