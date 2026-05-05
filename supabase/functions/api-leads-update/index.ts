import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authenticate, jsonResponse, jsonError } from "../_shared/utils.ts";

const VALID_STATUSES = ["New", "Contacted", "Replied", "Booked", "No-show"];

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
    const { lead_id, status } = body;

    if (!lead_id || !status) {
      return jsonError("Missing required fields: lead_id, status", 400);
    }

    if (!VALID_STATUSES.includes(status)) {
      return jsonError(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await sb.from("leads").update({ status }).eq("id", lead_id);

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonResponse({ success: true, lead_id, status });
  } catch (err) {
    return jsonError(err.message, 500);
  }
});
