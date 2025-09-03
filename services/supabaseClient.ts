import { createClient } from '@supabase/supabase-js';

// 중요: 아래 두 값을 당신의 Supabase 프로젝트 URL과 anon 키로 교체해주세요.
// Supabase 대시보드의 Project Settings > API 에서 찾을 수 있습니다.
const supabaseUrl = 'https://aoefflmxefybzpcazizg.supabase.co';
const supabaseAnonKey = 'sb_publishable_nMCjQ2hR_07BFeDOrONL2A_J041oGJa';

// FIX: Removed the check for placeholder Supabase credentials. Since the actual credentials
// have been provided, the check was redundant and caused a TypeScript error for
// comparing non-overlapping types.

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const testSupabaseConnection = async (): Promise<string> => {
    try {
        // Attempt a lightweight query to check the connection and key.
        // `head: true` ensures we don't retrieve data, just the status.
        const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });

        // If the error indicates an invalid JWT, the API key is likely wrong.
        if (error && (error.message.includes('invalid JWT') || error.message.includes('Invalid API key'))) {
            return `연결 실패: Supabase Anon 키가 올바르지 않습니다. Supabase 대시보드에서 확인해주세요.`;
        }

        // Any other error could be RLS policy or something else, but it means we connected.
        // If there's no error, the connection is definitely successful.
        return "연결 성공: Supabase URL과 Anon 키가 올바르게 설정되었습니다.";

    } catch (e) {
        // This will typically catch network errors if the URL is wrong or the service is down.
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.toLowerCase().includes('failed to fetch')) {
             return `연결 실패: Supabase URL이 잘못되었거나 네트워크 연결에 문제가 있습니다. URL을 확인해주세요.`;
        }
        return `알 수 없는 오류가 발생했습니다: ${errorMessage}`;
    }
};