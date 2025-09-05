// FIX: Replaced `declare global` with a `declare var` to avoid redeclaration
// errors for the Deno global in different function files.
declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for preflight requests and responses.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PPLX_API_URL = 'https://api.perplexity.ai/';

serve(async (req) => {
  // Handle CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { apiKey, endpoint, payload } = await req.json();

    if (!apiKey) throw new Error('Perplexity API key is required.');
    if (!endpoint) throw new Error('Perplexity API endpoint is required.');
    if (!payload) throw new Error('Request payload is required.');
    
    // Create a Supabase client with the user's auth context to verify they are logged in.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    // Forward the request to the Perplexity API.
    const response = await fetch(`${PPLX_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    
    const responseData = await response.json();

    // Proxy the response (including errors) back to the client.
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    });

  } catch (error) {
    // Handle internal errors (e.g., missing params, auth failure).
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})