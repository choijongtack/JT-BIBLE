import { supabase } from './supabaseClient';
import type { LearningSessionState, UserProgress, Profile } from '../types';

const API_TIMEOUT = 15000; // 15 seconds

function withTimeout<P extends PromiseLike<any>>(promise: P, ms: number): Promise<Awaited<P>> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(
        `데이터베이스 작업이 ${ms / 1000}초 후에 시간 초과되었습니다. ` +
        `이는 보통 Supabase의 RLS(행 수준 보안) 정책이 없거나 잘못 설정되었을 때 발생합니다. ` +
        `'profiles' 테이블에 대해 인증된 사용자가 자신의 데이터를 'SELECT', 'INSERT', 'UPDATE' 할 수 있도록 허용하는 정책이 있는지 확인해주세요. ` +
        `자세한 내용은 Supabase 문서를 참조하세요: https://supabase.com/docs/guides/auth/row-level-security`
      ));
    }, ms);

    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

// 🔑 세션 가져오기 헬퍼
async function getValidSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error("세션 확인 오류:", error.message);
    throw error;
  }
  if (!session) {
    throw new Error("세션이 없습니다. 로그인 필요");
  }
  return session;
}

export const registerUser = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
};

export const loginUser = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

export const logoutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const deleteUserAccount = async () => {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    method: 'POST',
  });

  if (error) {
    const context = (error as any).context;
    let detailedError = error.message;

    if (context && typeof context.error === 'string') {
      detailedError = context.error;
    } else if (context && typeof context.error === 'object' && context.error.message) {
      detailedError = context.error.message;
    }

    console.error('Error invoking delete-user function:', {
      message: error.message,
      context: context,
      status: (error as any).status,
    });
    throw new Error(`계정 삭제에 실패했습니다: ${detailedError}`);
  }

  if (data && data.error) {
    console.error('Error deleting user account (from data object):', data.error);
    throw new Error(`계정 삭제에 실패했습니다: ${data.error}`);
  }

  if (!data || !data.message) {
    console.error('Unexpected response from delete-user function:', data);
    throw new Error('사용자 삭제 중 예기치 않은 응답을 받았습니다.');
  }
};

// ✅ 세션 기반 프로필 조회
export const getProfile = async (): Promise<Profile | null> => {
  try {
    // 🟢 세션 먼저 확인
    const session = await getValidSession();
    console.log("현재 세션:", session); // ✅ 디버깅 로그 추가
    console.log("세션 user.id:", session.user.id);

    // 🟢 프로필 조회 실행
    const promise = supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    const { data, error, status } = await withTimeout(promise, API_TIMEOUT);
    console.log("프로필 조회 결과:", { data, error, status }); // ✅ 디버깅 로그 추가

    if (error && status !== 406) {
      console.error('프로필 조회 오류:', error.message);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("getProfile 실행 중 예외 발생:", error);
    throw error;
  }
};


// ✅ 세션 기반 프로필 생성
export const createProfile = async (email?: string): Promise<Profile> => {
  try {
    const session = await getValidSession();
    const userId = session.user.id;

    const insertPromise = supabase
      .from('profiles')
      .insert({
        id: userId,
        email: email,
        progress: {},
        active_learning_session: null,
      })
      .select()
      .single();

    const { data, error } = await withTimeout(insertPromise, API_TIMEOUT);

    if (error) {
      if (error.code === '23505') { // unique_violation
        console.warn('Profile already exists, likely created by trigger. Fetching.');
        const fetchPromise = supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        const { data: existingData, error: fetchError } = await withTimeout(fetchPromise, API_TIMEOUT);
        if (fetchError) throw fetchError;
        if (!existingData) throw new Error("Profile not found even after unique violation.");

        return existingData;
      }
      throw error;
    }
    if (!data) throw new Error("Insert operation did not return profile data.");
    return data;

  } catch (error) {
    console.error('Error in createProfile:', error);
    throw new Error(`Failed to create user profile: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// ✅ 세션 기반 유저 진행도 업데이트
export const updateUserProgress = async (book: string, newTopic: string, currentProgress: UserProgress): Promise<UserProgress> => {
  const session = await getValidSession();
  const userId = session.user.id;

  const updatedProgress = { ...currentProgress };
  if (!updatedProgress[book]) {
    updatedProgress[book] = [];
  }
  if (!updatedProgress[book].includes(newTopic)) {
    updatedProgress[book].push(newTopic);
  }

  const promise = supabase
    .from('profiles')
    .update({ progress: updatedProgress, updated_at: new Date().toISOString() })
    .eq('id', userId);

  const { error } = await withTimeout(promise, API_TIMEOUT);

  if (error) {
    console.error('Error updating progress:', error.message);
    throw error;
  }
  return updatedProgress;
};

// ✅ 세션 기반 학습 세션 저장
export const saveActiveSession = async (sessionData: LearningSessionState | null) => {
  const session = await getValidSession();
  const userId = session.user.id;

  const promise = supabase
    .from('profiles')
    .update({ active_learning_session: sessionData, updated_at: new Date().toISOString() })
    .eq('id', userId);

  const { error } = await withTimeout(promise, API_TIMEOUT);

  if (error) {
    console.error('Error saving active session:', error.message);
    throw error;
  }
};
