// FIX: Added Deno type declaration to resolve "Cannot find name 'Deno'" error.
declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Deno의 crypto와 serve 함수를 import합니다.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Base64 인코딩/디코딩을 위해 Deno 표준 라이브러리를 사용합니다.
import { encode as base64Encode, decode as base64Decode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// CORS 헤더를 상수로 정의하여 재사용성을 높입니다.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ENC_SECRET = Deno.env.get("ENCRYPTION_SECRET");

// 보안을 위해 환경 변수가 설정되었는지 확인합니다.
if (!ENC_SECRET) {
  console.error("ENCRYPTION_SECRET 환경 변수가 설정되지 않았습니다.");
  throw new Error("서버 설정 오류: ENCRYPTION_SECRET이 누락되었습니다.");
}


// AES-GCM 암호화/복호화 유틸리티 함수
async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // 사용자가 실수로 공백을 포함했을 경우를 대비해 trim()을 추가합니다.
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

// 키 생성 Promise를 미리 만들어 둡니다.
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

  // Deno 표준 라이브러리를 사용하여 Base64로 인코딩합니다.
  return base64Encode(result);
}

async function decrypt(base64: string): Promise<string> {
  try {
    // Deno 표준 라이브러리를 사용하여 Base64를 디코딩합니다.
    const raw = base64Decode(base64);

    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const key = await cryptoKeyPromise;
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("복호화 실패:", e.message);
    // 복호화 실패 시 더 구체적인 오류 메시지를 제공합니다.
    if (e.name === 'DOMException' || e.message.includes('decryption failed')) {
        throw new Error("API 키 복호화에 실패했습니다. 데이터가 손상되었거나 암호화 키(ENCRYPTION_SECRET)가 변경되었을 수 있습니다.");
    }
    throw new Error(`API 키 복호화에 실패했습니다. (${e.message})`);
  }
}

// 메인 서버 로직
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 인증된 사용자인지 확인합니다.
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("사용자가 인증되지 않았습니다.");

    const url = new URL(req.url);

    // API 키 저장 엔드포인트 (/save-chatgpt-key)
    if (url.pathname.endsWith("/save-chatgpt-key")) {
      const { apiKey } = await req.json();
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error("유효한 ChatGPT API 키를 입력해야 합니다.");
      }

      const encryptedKey = await encrypt(apiKey.trim());
      const { error } = await supabaseClient
        .from("profiles")
        .update({ chatgpt_api_key: encryptedKey, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ message: "ChatGPT API 키가 성공적으로 저장되었습니다." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // ChatGPT API 호출 엔드포인트 (/chatgpt-completion)
    else if (url.pathname.endsWith("/delete-chatgpt-key")) {
      if (req.method !== "POST") throw new Error("API 키 삭제는 POST 요청만 허용됩니다.");
      const { data, error } = await supabaseClient.from("profiles")
        .update({ chatgpt_api_key: null, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("사용자 프로필을 찾을 수 없습니다.");
      return new Response(JSON.stringify({ message: "ChatGPT API 키가 삭제되었습니다." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }
    else if (url.pathname.endsWith("/chatgpt-completion")) {
      const completionPayload = await req.json();
      if (!completionPayload || !completionPayload.messages || !Array.isArray(completionPayload.messages)) {
        throw new Error("요청 페이로드가 유효하지 않습니다. 'messages' 배열을 포함한 OpenAI chat completion 객체여야 합니다.");
      }

      const { data: userProfile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("chatgpt_api_key")
        .eq("id", user.id)
        .single();

      if (profileError || !userProfile?.chatgpt_api_key) {
        throw new Error("ChatGPT API 키를 찾을 수 없습니다. 먼저 키를 저장해주세요.");
      }

      const decryptedKey = await decrypt(userProfile.chatgpt_api_key);

      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${decryptedKey}`
        },
        body: JSON.stringify(completionPayload)
      });
      
      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }
        console.error(`[ChatGPT Proxy] OpenAI API Error (${response.status}):`, errorBody);
        const errorMessage = typeof errorBody === 'string'
          ? errorBody
          : (errorBody?.error?.message || 'OpenAI API request failed');

        return new Response(JSON.stringify({ error: { message: errorMessage } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status,
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: response.status
      });
    }

    // 잘못된 경로 처리
    return new Response(JSON.stringify({ error: { message: "유효하지 않은 엔드포인트입니다." } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404
    });

  } catch (error) {
    console.error("ChatGPT 프록시 함수 오류:", error.message);
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
