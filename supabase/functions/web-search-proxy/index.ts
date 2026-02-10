declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERPAPI_API_KEY = Deno.env.get("SERPAPI_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    }

    if (!SERPAPI_API_KEY) {
      throw new Error("Missing SERPAPI_API_KEY");
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: { message: "User not authenticated." } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { query, numResults } = await req.json();
    if (!query || typeof query !== "string") {
      throw new Error("query is required");
    }

    const n = Math.max(1, Math.min(Number(numResults ?? 5), 10));
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(n));
    url.searchParams.set("api_key", SERPAPI_API_KEY);
    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", "us");

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Web search failed: ${response.status} ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];

    const results = organic.slice(0, n).map((r: any) => ({
      title: String(r?.title ?? ""),
      url: String(r?.link ?? ""),
      snippet: String(r?.snippet ?? ""),
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: { message } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

