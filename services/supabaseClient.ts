import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "https://aoefflmxefybzpcazizg.supabase.co";
const supabaseAnonKey = "sb_publishable_nMCjQ2hR_07BFeDOrONL2A_J041oGJa";

// ✅ 탭/창 독립 세션 저장소
const createTabScopedStorage = () => {
  if (!window.name) {
    window.name = "tab_" + Math.random().toString(36).substring(2);
  }
  const prefix = `supabase_${window.name}_`;

  return {
    getItem: (key: string) => {
      try {
        return window.sessionStorage.getItem(prefix + key);
      } catch {
        return window.localStorage.getItem(prefix + key); // 모바일 fallback
      }
    },
    setItem: (key: string, value: string) => {
      try {
        window.sessionStorage.setItem(prefix + key, value);
      } catch {
        window.localStorage.setItem(prefix + key, value);
      }
    },
    removeItem: (key: string) => {
      try {
        window.sessionStorage.removeItem(prefix + key);
      } catch {
        window.localStorage.removeItem(prefix + key);
      }
    },
  };
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: createTabScopedStorage(), // ← 핵심
  },
});

// ✅ 강제 로그아웃 fallback 헬퍼
export const ensureValidSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("세션 확인 오류:", error.message);
      await supabase.auth.signOut();
      window.location.href = "/login"; // 로그인 페이지로 강제 이동
      return null;
    }
    if (!data.session) {
      console.warn("세션 없음 → 강제 로그아웃");
      await supabase.auth.signOut();
      window.location.href = "/login";
      return null;
    }
    return data.session;
  } catch (err) {
    console.error("세션 확인 중 예외:", err);
    await supabase.auth.signOut();
    window.location.href = "/login";
    return null;
  }
};

// ✅ 연결 테스트 유틸 (디버깅용)
export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export const testSupabaseConnection = async (): Promise<ConnectionTestResult> => {
  try {
    const { error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (error) {
      if (
        error.message.includes("invalid JWT") ||
        error.message.includes("Invalid API key")
      ) {
        return {
          success: false,
          message: "연결 실패: Supabase Anon 키가 올바르지 않습니다.",
        };
      }
      return {
        success: false,
        message: `연결 실패: ${error.message}.`,
      };
    }

    return {
      success: true,
      message: "연결 성공: Supabase URL과 Anon 키가 올바르게 설정되었습니다.",
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (errorMessage.toLowerCase().includes("failed to fetch")) {
      return {
        success: false,
        message:
          "연결 실패: Supabase URL이 잘못되었거나 네트워크 연결에 문제가 있습니다.",
      };
    }
    return {
      success: false,
      message: `알 수 없는 오류: ${errorMessage}`,
    };
  }
};