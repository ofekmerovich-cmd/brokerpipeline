export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function authenticate(req: Request): { ok: true } | { ok: false; error: string } {
  const apiKey = req.headers.get("x-api-key");
  const validKey = Deno.env.get("BROKER_API_KEY");

  if (!apiKey) {
    return { ok: false, error: "Missing x-api-key header" };
  }

  if (apiKey !== validKey) {
    return { ok: false, error: "Invalid API key" };
  }

  return { ok: true };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
