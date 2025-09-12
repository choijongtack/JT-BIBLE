import { supabase } from './supabaseClient';
import type { LearningSessionState, UserProgress, Profile, BookProgress } from '../types';
import { LearningStep } from '../constants';

const API_TIMEOUT = 10000;
const TIMEOUT_ERROR_MESSAGE =
  `데이터베이스 작업이 ${API_TIMEOUT / 1000}초 후에 시간 초과되었습니다. ` +
  `이는 보통 Supabase의 RLS 정책이 없거나 잘못 설정되었을 때 발생합니다. ` +
  `'profiles' 테이블에 대해 인증된 사용자가 자신의 데이터를 'SELECT', 'INSERT', 'UPDATE' 할 수 있도록 허용하는 정책이 있는지 확인해주세요. ` +
  `자세한 내용은 Supabase 문서를 참조하세요: https://supabase.com/docs/guides/auth/row-level-security`;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Promise timed out')), ms);
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

async function getValidSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error("세션이 없습니다. 로그인 필요");
  return session;
}

export interface ProgressDebugInfo {
  before: UserProgress | null;
  request: UserProgress | null;
  after: UserProgress | null;
  error: string | null;
}

// ---------------- 인증/계정 ----------------
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
  const { error } = await supabase.functions.invoke('delete-user');
  if (error) {
    console.error('Error deleting user account:', error.message);
    throw new Error(`계정 삭제에 실패했습니다: ${error.message}`);
  }
};

// ---------------- 프로필 ----------------
export const getProfile = async (): Promise<Profile | null> => {
  try {
    const session = await getValidSession();
    const profileQuery = supabase.from("profiles").select("*").eq("id", session.user.id).single();
    const { data, error, status } = await withTimeout(Promise.resolve(profileQuery), API_TIMEOUT);
    if (error && status !== 406) throw error;
    return data;
  } catch (error) {
    if (error instanceof Error && error.message === 'Promise timed out') {
      throw new Error(TIMEOUT_ERROR_MESSAGE);
    }
    throw error;
  }
};

export const createProfile = async (email?: string): Promise<Profile> => {
  try {
    const session = await getValidSession();
    const userId = session.user.id;
    const insertQuery = supabase
      .from('profiles')
      .insert({
        id: userId,
        email,
        progress: {},
        active_learning_session: null,
      })
      .select()
      .single();
    const { data, error } = await withTimeout(Promise.resolve(insertQuery), API_TIMEOUT);
    if (error) throw error;
    return data;
  } catch (error) {
    if (error instanceof Error && error.message === 'Promise timed out') {
      throw new Error(TIMEOUT_ERROR_MESSAGE);
    }
    throw error;
  }
};

// ---------------- 학습 진행도 & 세션 ----------------

export const updateUserProgress = async (
  book: string,
  bookProgress: BookProgress
): Promise<ProgressDebugInfo> => {
  const debugInfo: ProgressDebugInfo = { before: null, request: null, after: null, error: null };

  try {
    const session = await getValidSession();
    const userId = session.user.id;

    // 현재 프로필 progress 가져오기
    const fetchQuery = supabase.from("profiles").select("progress").eq("id", userId).single();
    const { data: currentProfile, error: fetchError } = await withTimeout(Promise.resolve(fetchQuery), API_TIMEOUT);
    if (fetchError) throw fetchError;

    debugInfo.before = currentProfile?.progress || {};
    const newProgress = JSON.parse(JSON.stringify(currentProfile?.progress || {}));

    // progress에는 책별로 마지막 학습 세션 상태와 완료된 토픽 목록을 저장합니다.
    newProgress[book] = bookProgress;

    debugInfo.request = newProgress;

    const updateQuery = supabase
      .from("profiles")
      .update({
        progress: newProgress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("progress, active_learning_session")
      .single();

    const { data: updatedData, error: updateError } = await withTimeout(Promise.resolve(updateQuery), API_TIMEOUT);
    if (updateError) throw updateError;

    debugInfo.after = updatedData.progress as UserProgress;
    return debugInfo;
  } catch (error) {
    debugInfo.error = error instanceof Error ? error.message : String(error);
    return debugInfo;
  }
};

export const saveActiveSession = async (sessionState: LearningSessionState | null) => {
  try {
    const session = await getValidSession();
    const userId = session.user.id;

    const { error } = await supabase
      .from('profiles')
      .update({ active_learning_session: sessionState, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to save active session:", error);
    // Do not throw to avoid crashing the app on background saves.
  }
};

//export const testUpdateProgress = async () => {
//    console.log("--- Running Progress Update Test ---");
//    const testBook = `Test Book ${new Date().toLocaleTimeString()}`;
//    const testSession: LearningSessionState = {
//        topic: `${testBook} 1:1-5`,
//        currentStep: LearningStep.TEST,
//        messages: [{ role: 'user', content: 'test message' }, { role: 'model', content: 'test response' }],
//        aiModel: 'gemini',
//        bibleVerse: 'This is the test bible verse text.',
//        score: 10,
//        quizData: { topic: "Test Quiz", questions: [] },
//        currentQuestionIndex: 0,
//        isComplete: true,
//    };
    
//    const testBookProgress: BookProgress = {
//      lastSession: testSession,
//      completedTopics: [`${testBook} 1:1-5`]
//    };

//    alert("Sending test update. Check your browser's developer console (F12) for detailed debug info.");
    
//    const result = await updateUserProgress(testBook, testBookProgress);
    
//    console.log("--- Progress Update Test Result ---", result);

//    if (result.error) {
//        console.error("Test Update Failed:", result.error);
//        alert(`Test update failed: ${result.error}\n\nCheck the console for details.`);
//    } else {
//        console.log("Test Update Successful. 'After' state:", result.after);
//        alert("Test update appears to have succeeded. Check the console to verify the 'before' and 'after' states.");
//    }
//};
