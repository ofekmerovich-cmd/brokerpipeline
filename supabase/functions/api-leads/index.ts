import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticate, jsonResponse, jsonError } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const authResult = authenticate(req);
  if (!authResult.ok) {
    return jsonError(authResult.error, 401);
  }

  try {
    const body = await req.json();
    const { client_id, name, company, email, phone, specialty, score, status } = body;

    if (!client_id || !name || !email) {
      return jsonError("Missing required fields: client_id, name, email", 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await sb.from("leads").insert({
      user_id: client_id,
      name,
      company: company || null,
      email,
      phone: phone || null,
      specialty: specialty || "Commercial",
      score: score ?? 7,
      status: status || "New",
      date_added: new Date().toISOString().split("T")[0],
    }).select("id").single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonResponse({ success: true, lead_id: data.id });
  } catch (err) {
    return jsonError(err.message, 500);
  }
});
