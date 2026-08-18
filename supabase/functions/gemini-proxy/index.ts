// FIX: Added Deno type declaration to resolve "Cannot find name 'Deno'".
declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ALLOWED_MODELS = new Set([
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
]);

const getGeminiApiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check for required environment variables for security and functionality.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
      throw new Error('Internal server configuration error');
      
    }

    // Authenticate the user making the request.
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not authenticated.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // FIX: To align with other proxy functions, the request body is now expected
    // to be an object with a 'payload' key containing the actual Gemini request.
    const { payload, model } = await req.json();

    if (!payload || !payload.contents) {
        throw new Error("Request body must contain a 'payload' property with a valid Gemini 'contents' object.");
    }

    const requestedModel = typeof model === 'string' ? model.trim() : DEFAULT_GEMINI_MODEL;
    const geminiModel = GEMINI_ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_GEMINI_MODEL;

    const response = await fetch(`${getGeminiApiUrl(geminiModel)}?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
