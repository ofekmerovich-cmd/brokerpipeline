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
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: clients, error: clientErr } = await sb
      .from("client_onboarding")
      .select("user_id, full_name, email")
      .eq("completed", true);

    if (clientErr) {
      return jsonError(clientErr.message, 500);
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekStart = oneWeekAgo.toISOString().split("T")[0];

    const results = [];

    for (const client of clients || []) {
      const [leadsRes, apptsRes] = await Promise.all([
        sb.from("leads").select("id").eq("user_id", client.user_id).gte("date_added", weekStart),
        sb.from("appointments").select("id, prospect_name, meeting_datetime")
          .eq("user_id", client.user_id).gte("meeting_datetime", weekStart),
      ]);

      const leadsCount = leadsRes.data?.length || 0;
      const apptsCount = apptsRes.data?.length || 0;
      const pipelineValue = apptsCount * 8000;

      const reportsRes = await sb
        .from("reports")
        .select("emails_sent")
        .eq("user_id", client.user_id)
        .order("id", { ascending: false })
        .limit(1);

      const emailsSent = reportsRes.data?.[0]?.emails_sent || 0;

      const appointmentsList = (apptsRes.data || []).map((a: any) => {
        const d = new Date(a.meeting_datetime);
        return {
          prospect_name: a.prospect_name,
          meeting_date: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
          meeting_time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        };
      });

      const appointmentsBlock = appointmentsList.length > 0
        ? `\nYour meetings this week:\n${appointmentsList.map(
            (a: any) => `• ${a.prospect_name} — ${a.meeting_date} at ${a.meeting_time}`
          ).join("\n")}\n`
        : "";

      const emailBody = `Hi ${client.full_name || "there"},

Here's your pipeline update for last week:

✅ New Leads Added: ${leadsCount}
📧 Emails Sent: ${emailsSent}
📅 Appointments Booked: ${apptsCount}
💰 Estimated New Pipeline: $${pipelineValue.toLocaleString()}
${appointmentsBlock}
Log in to see your full dashboard:
https://brokerpipeline.ai/dashboard

Talk soon,
The BrokerPipeline Team`;

      const { error: logErr } = await sb.from("email_logs").insert({
        user_id: client.user_id,
        email_to: client.email,
        subject: "Your BrokerPipeline Weekly Update 📊",
        body: emailBody,
        type: "weekly_report",
        sent_at: new Date().toISOString(),
      });

      results.push({
        client_id: client.user_id,
        name: client.full_name,
        leads: leadsCount,
        appointments: apptsCount,
        email_logged: !logErr,
      });
    }

    return jsonResponse({
      success: true,
      reports_sent: results.length,
      details: results,
    });
  } catch (err) {
    return jsonError(err.message, 500);
  }
});
