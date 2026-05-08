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

    // Send email notification to client via Resend
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const { data: profile } = await sb
        .from("client_onboarding")
        .select("full_name, email")
        .eq("user_id", client_id)
        .single();

      if (profile?.email && resendKey) {
        const dt = new Date(meeting_datetime);
        const formatted = dt.toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
        });

        const emailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:12px;">
            <div style="margin-bottom:24px;">
              <span style="font-size:18px;font-weight:700;color:#111;">BrokerPipeline<span style="color:#2563EB;">.ai</span></span>
            </div>
            <h2 style="font-size:22px;color:#111;margin:0 0 16px;">New Appointment Booked! 🎉</h2>
            <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 8px;">
              Hey ${profile.full_name || "there"},
            </p>
            <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 20px;">
              Great news — a new appointment has been booked for you.
            </p>
            <div style="background:#f8f9fa;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
              <p style="margin:0 0 8px;font-size:15px;"><strong>Prospect:</strong> ${prospect_name}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Date & Time:</strong> ${formatted}</p>
              ${specialty ? `<p style="margin:0 0 8px;font-size:15px;"><strong>Specialty:</strong> ${specialty}</p>` : ""}
              ${notes ? `<p style="margin:0;font-size:15px;"><strong>Notes:</strong> ${notes}</p>` : ""}
            </div>
            <a href="https://brokerpipeline.vercel.app/dashboard.html" style="display:inline-block;background-color:#2563EB;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:50px;">
              View in Dashboard →
            </a>
            <p style="font-size:13px;color:#999;margin-top:24px;">
              Aria from BrokerPipeline.ai
            </p>
          </div>
        `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "BrokerPipeline <onboarding@resend.dev>",
            to: [profile.email],
            subject: `New Appointment Booked — ${prospect_name}`,
            html: emailHtml,
          }),
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
