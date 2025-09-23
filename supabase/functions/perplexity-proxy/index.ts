// FIX: Replaced `declare global` with a `declare var` to avoid redeclaration
// errors for the Deno global in different function files.
declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode, decode as base64Decode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const PPLX_API_URL = "https://api.perplexity.ai/chat/completions";
const PPLX_TEST_MODEL = 'llama-3-sonar-small-32k-online';
const ENC_SECRET = Deno.env.get("ENCRYPTION_SECRET");

if (!ENC_SECRET) {
  throw new Error("서버 설정 오류: ENCRYPTION_SECRET이 누락되었습니다.");
}

// AES-GCM 암호화/복호화 유틸리티
async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret.trim());
  const hash = await crypto.subtle.digest('SHA-256', keyData);
  return await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

const cryptoKeyPromise = getKey(ENC_SECRET);

async function encrypt(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cryptoKeyPromise;
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );
  const buff = new Uint8Array(ciphertext);
  const result = new Uint8Array(iv.length + buff.length);
  result.set(iv, 0);
  result.set(buff, iv.length);
  return base64Encode(result);
}

async function decrypt(base64: string): Promise<string> {
  try {
    const raw = base64Decode(base64);
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const key = await cryptoKeyPromise;
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    throw new Error(`API 키 복호화에 실패했습니다. 키가 손상되었거나 ENCRYPTION_SECRET이 변경되었을 수 있습니다. (${e.message})`);
  }
}

// Perplexity API 호출 헬퍼
const callPerplexityApi = async (apiKey: string, payload: object) => {
    const response = await fetch(PPLX_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorBody;
        try {
            errorBody = await response.json();
        } catch {
            errorBody = await response.text();
        }
        console.error(`[Perplexity Proxy] API Error (${response.status}):`, errorBody);
        const errorMessage = typeof errorBody === 'string'
          ? errorBody
          : (errorBody?.error?.message || errorBody?.detail || 'Perplexity API request failed');
        
        throw new Error(errorMessage);
    }
    
    return await response.json();
};

// 메인 서버 로직
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("사용자가 인증되지 않았습니다.");

    const url = new URL(req.url);

    // 엔드포인트: /save-perplexity-key
    if (url.pathname.endsWith("/save-perplexity-key")) {
      const { apiKey } = await req.json();
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error("유효한 Perplexity API 키를 입력해야 합니다.");
      }
      
      const trimmedApiKey = apiKey.trim();

      // 저장 전 키 유효성 검사
      try {
          await callPerplexityApi(trimmedApiKey, {
              model: PPLX_TEST_MODEL,
              messages: [{ role: 'user', content: 'Hello' }],
              max_tokens: 5,
          });
      } catch (testError) {
          throw new Error(`제공된 API 키가 유효하지 않습니다. Perplexity API 오류: ${testError.message}`);
      }
      
      const encryptedKey = await encrypt(trimmedApiKey);
      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ perplexity_api_key: encryptedKey, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ message: "Perplexity API 키가 성공적으로 저장되었습니다." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }
    
    // 엔드포인트: /perplexity-completion (메인 프록시)
    else if (url.pathname.endsWith("/perplexity-completion")) {
        const { payload: completionPayload } = await req.json();
        if (!completionPayload || !completionPayload.messages || !Array.isArray(completionPayload.messages)) {
            throw new Error("요청 페이로드가 유효하지 않습니다. 'messages' 배열을 포함해야 합니다.");
        }

        const { data: userProfile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("perplexity_api_key")
            .eq("id", user.id)
            .single();

        if (profileError || !userProfile?.perplexity_api_key) {
            throw new Error("Perplexity API 키를 찾을 수 없습니다. 먼저 키를 저장해주세요.");
        }

        const decryptedKey = await decrypt(userProfile.perplexity_api_key);
        const data = await callPerplexityApi(decryptedKey, completionPayload);

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });
    }

    // 잘못된 경로 처리
    return new Response(JSON.stringify({ error: { message: "유효하지 않은 엔드포인트입니다." } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404
    });

  } catch (error) {
    console.error("Perplexity 프록시 함수 오류:", error.message);
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
