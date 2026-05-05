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
    const { client_id, week, leads_added, emails_sent, replies, appointments } = body;

    if (!client_id || !week) {
      return jsonError("Missing required fields: client_id, week", 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const total = (leads_added || 0);
    const appts = (appointments || 0);
    const conversion_rate = total > 0 ? parseFloat(((appts / total) * 100).toFixed(1)) : 0;

    const { data, error } = await sb.from("reports").insert({
      user_id: client_id,
      week,
      leads_added: leads_added || 0,
      emails_sent: emails_sent || 0,
      replies: replies || 0,
      appointments: appointments || 0,
      conversion_rate,
    }).select("id").single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonResponse({ success: true, report_id: data.id });
  } catch (err) {
    return jsonError(err.message, 500);
  }
});
