import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aoefflmxefybzpcazizg.supabase.co';
const supabaseAnonKey = 'sb_publishable_nMCjQ2hR_07BFeDOrONL2A_J041oGJa';

// ✅ 모바일 브라우저 대응: localStorage 대신 sessionStorage 사용
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.sessionStorage,  // ← 핵심 수정 부분
  },
});

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export const testSupabaseConnection = async (): Promise<ConnectionTestResult> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      if (error.message.includes('invalid JWT') || error.message.includes('Invalid API key')) {
        return {
          success: false,
          message: `연결 실패: Supabase Anon 키가 올바르지 않습니다. Supabase 대시보드에서 확인해주세요.`
        };
      }
      return {
        success: false,
        message: `연결 실패: ${error.message}. URL, Anon 키 또는 데이터베이스 설정을 확인하세요.`
      };
    }

    return {
      success: true,
      message: '연결 성공: Supabase URL과 Anon 키가 올바르게 설정되었습니다.'
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (errorMessage.toLowerCase().includes('failed to fetch')) {
      return {
        success: false,
        message: `연결 실패: Supabase URL이 잘못되었거나 네트워크 연결에 문제가 있습니다. URL을 확인해주세요.`
      };
    }
    return {
      success: false,
      message: `알 수 없는 오류가 발생했습니다: ${errorMessage}`
    };
  }
};
