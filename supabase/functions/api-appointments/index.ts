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
    const { client_id, prospect_name, prospect_email, meeting_datetime, specialty, notes } = body;

    if (!client_id || !prospect_name || !meeting_datetime) {
      return jsonError("Missing required fields: client_id, prospect_name, meeting_datetime", 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await sb.from("appointments").insert({
      user_id: client_id,
      prospect_name,
      company: prospect_email || null,
      meeting_datetime,
      specialty: specialty || "Commercial",
      status: "Upcoming",
      notes: notes || null,
    }).select("id").single();

    if (error) {
      return jsonError(error.message, 500);
    }

    // Send email notification to client
    try {
      const { data: profile } = await sb
        .from("client_onboarding")
        .select("full_name, email")
        .eq("user_id", client_id)
        .single();

      if (profile?.email) {
        const dt = new Date(meeting_datetime);
        const formatted = dt.toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
        });

        await sb.functions.invoke("send-notification", {
          body: {
            to: profile.email,
            subject: `New Appointment Booked — ${prospect_name}`,
            html: `
              <h2>New appointment booked!</h2>
              <p><strong>${prospect_name}</strong> has been scheduled for <strong>${formatted}</strong>.</p>
              ${specialty ? `<p>Specialty: ${specialty}</p>` : ""}
              ${notes ? `<p>Notes: ${notes}</p>` : ""}
              <p><a href="https://brokerpipeline.ai/dashboard.html">View in Dashboard</a></p>
            `,
          },
        });
      }
    } catch (_notifErr) {
      // Notification failure shouldn't break the appointment creation
    }

    return jsonResponse({ success: true, appointment_id: data.id });
  } catch (err) {
    return jsonError(err.message, 500);
  }
});
