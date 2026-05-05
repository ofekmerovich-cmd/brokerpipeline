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

  const apolloKey = Deno.env.get("APOLLO_API_KEY");
  if (!apolloKey) {
    return jsonError("Apollo API key not configured. Set APOLLO_API_KEY in edge function secrets.", 500);
  }

  try {
    const body = await req.json();
    const clientId = body.client_id;
    if (!clientId) {
      return jsonError("client_id is required");
    }

    const perPage = Math.min(body.per_page || 50, 100);
    const page = body.page || 1;

    const apolloBody: any = {
      page: page,
      per_page: perPage,
      person_titles: body.job_titles || [
        "Insurance Broker",
        "Independent Insurance Agent",
        "Insurance Agency Owner",
        "Financial Advisor",
        "Life Insurance Agent",
        "Commercial Insurance Broker",
        "Independent Agent"
      ],
      person_seniorities: body.seniority || ["owner", "founder", "c_suite", "partner"],
      organization_num_employees_ranges: body.company_size || ["1,10"],
      person_locations: body.locations || ["United States"],
      organization_industry_tag_ids: [],
      q_organization_keyword_tags: body.industries || ["insurance", "financial services"],
    };

    const excludeCompanies = body.exclude_companies || [
      "State Farm", "Allstate", "Farmers", "Nationwide", "Liberty Mutual", "Progressive"
    ];
    if (excludeCompanies.length > 0) {
      apolloBody.q_organization_not_keyword_tags = excludeCompanies;
    }

    const apolloRes = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apolloKey,
      },
      body: JSON.stringify(apolloBody),
    });

    if (!apolloRes.ok) {
      const errText = await apolloRes.text();
      return jsonError(`Apollo API error (${apolloRes.status}): ${errText}`, 502);
    }

    const apolloData = await apolloRes.json();
    const people = apolloData.people || [];

    if (people.length === 0) {
      return jsonResponse({
        success: true,
        leads_found: 0,
        leads_imported: 0,
        message: "No results from Apollo matching your ICP criteria.",
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const leads = people.map((p: any) => ({
      user_id: clientId,
      name: [p.first_name, p.last_name].filter(Boolean).join(" "),
      company: p.organization?.name || "",
      email: p.email || "",
      phone: p.phone_numbers?.[0]?.sanitized_number || "",
      specialty: p.title || "",
      source: "apollo",
      status: "New",
      score: 0,
      linkedin_url: p.linkedin_url || "",
      city: p.city || "",
      state: p.state || "",
      date_added: new Date().toISOString(),
    }));

    const validLeads = leads.filter((l: any) => l.email);

    let imported = 0;
    if (validLeads.length > 0) {
      const { data, error } = await sb.from("leads").insert(validLeads).select("id");
      if (error) {
        return jsonError(`Failed to insert leads: ${error.message}`, 500);
      }
      imported = data?.length || 0;
    }

    return jsonResponse({
      success: true,
      leads_found: people.length,
      leads_with_email: validLeads.length,
      leads_imported: imported,
      pagination: {
        page: page,
        per_page: perPage,
        total_entries: apolloData.pagination?.total_entries || 0,
        total_pages: apolloData.pagination?.total_pages || 0,
      },
    });
  } catch (err) {
    return jsonError(err.message, 500);
  }
});
