// FIX: Updated the Deno types reference to use a full URL, which is more reliable for resolving Supabase edge function types and fixing "Cannot find name 'Deno'" errors.
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS 헤더를 상수로 정의하여 재사용성을 높이고 실수를 방지합니다.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 브라우저의 CORS preflight 요청을 처리합니다.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const service_role_key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl) {
        throw new Error('SUPABASE_URL이 환경 변수에 설정되지 않았습니다.');
    }
    if (!service_role_key) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY가 환경 변수에 설정되지 않았습니다.');
    }

    // 1. 함수를 호출한 사용자의 인증 컨텍스트로 Supabase 클라이언트를 생성합니다.
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 2. 사용자 객체를 가져옵니다.
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
        return new Response(JSON.stringify({ error: '사용자를 찾을 수 없습니다. 다시 로그인해주세요.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
        });
    }
    
    // 3. 관리자 권한으로 Supabase 클라이언트를 생성하여 데이터베이스 작업을 수행합니다.
    const adminClient = createClient(supabaseUrl, service_role_key);

    // 4. 먼저 사용자의 public.profiles 테이블에서 프로필을 삭제합니다.
    const { error: profileError } = await adminClient
        .from('profiles')
        .delete()
        .eq('id', user.id);

    if (profileError) {
        console.error(`프로필 삭제 실패 (사용자 ID: ${user.id}):`, profileError.message);
        throw new Error(`사용자 프로필을 삭제하는 데 실패했습니다: ${profileError.message}`);
    }

    // 5. 다음으로 auth.users 테이블에서 사용자를 삭제합니다.
    const { error: authError } = await adminClient.auth.admin.deleteUser(user.id);

    if (authError) {
      // Supabase에서 발생한 구체적인 오류를 그대로 전달합니다.
      throw authError;
    }
    
    // 6. 성공 응답을 반환합니다.
    return new Response(JSON.stringify({ message: "사용자가 성공적으로 삭제되었습니다." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // 모든 예외 상황을 처리하고 CORS 헤더를 포함하여 오류 응답을 반환합니다.
    console.error('회원 탈퇴 함수 오류:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
