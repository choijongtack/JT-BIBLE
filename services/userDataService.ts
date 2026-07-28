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
  // FIX: Switched to supabase.auth.getSession() which is the correct method in Supabase JS v2.
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

export interface CompletedPassage {
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export const getCompletedPassages = async (): Promise<CompletedPassage[] | null> => {
  try {
    await getValidSession();
    const { data, error } = await supabase
      .from('completed_passages')
      .select('book, chapter, start_verse, end_verse')
      .order('completed_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(row => ({
      book: row.book,
      chapter: row.chapter,
      startVerse: row.start_verse,
      endVerse: row.end_verse,
    }));
  } catch (error) {
    console.warn('완료 구간 조회에 실패했습니다. 기존 JSONB 진행률을 사용합니다.', error);
    return null;
  }
};

export const saveCompletedPassage = async (passage: CompletedPassage): Promise<{ error: string | null }> => {
  try {
    const session = await getValidSession();
    const { error } = await supabase
      .from('completed_passages')
      .upsert({
        user_id: session.user.id,
        book: passage.book,
        chapter: passage.chapter,
        start_verse: passage.startVerse,
        end_verse: passage.endVerse,
      }, { onConflict: 'user_id,book,chapter,start_verse,end_verse' });

    return { error: error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export const completeStudySession = async (params: {
  book: string;
  bookProgress: BookProgress;
  topic: string;
  mode: 'general' | 'advanced';
  aiModel: 'gemini' | 'perplexity' | 'chatgpt';
  currentStep: LearningStep;
  passage: CompletedPassage;
}): Promise<{ error: string | null }> => {
  try {
    await getValidSession();
    const { error } = await supabase.rpc('complete_study_session', {
      p_book: params.book,
      p_book_progress: params.bookProgress,
      p_topic: params.topic,
      p_mode: params.mode,
      p_ai_model: params.aiModel,
      p_current_step: params.currentStep,
      p_passage_book: params.passage.book,
      p_chapter: params.passage.chapter,
      p_start_verse: params.passage.startVerse,
      p_end_verse: params.passage.endVerse,
    });
    return { error: error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export const getStudySession = async (book: string): Promise<LearningSessionState | null> => {
  try {
    await getValidSession();
    const { data, error } = await supabase
      .from('study_sessions')
      .select('topic, mode, ai_model, current_step, messages, bible_verse, score, quiz_data, current_question_index, is_complete')
      .eq('book', book)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      topic: data.topic,
      mode: data.mode,
      aiModel: data.ai_model,
      currentStep: data.current_step as LearningStep,
      messages: data.messages ?? [],
      bibleVerse: data.bible_verse,
      score: data.score ?? 0,
      quizData: data.quiz_data,
      currentQuestionIndex: data.current_question_index ?? 0,
      isComplete: data.is_complete,
    };
  } catch (error) {
    console.warn('별도 학습 세션 조회에 실패했습니다. 기존 progress를 사용합니다.', error);
    return null;
  }
};

export const saveStudySession = async (book: string, sessionState: LearningSessionState): Promise<{ error: string | null }> => {
  try {
    const session = await getValidSession();
    const { error } = await supabase.from('study_sessions').upsert({
      user_id: session.user.id,
      book,
      topic: sessionState.topic,
      mode: sessionState.mode,
      ai_model: sessionState.aiModel,
      current_step: sessionState.currentStep,
      messages: sessionState.messages,
      bible_verse: sessionState.bibleVerse,
      score: sessionState.score,
      quiz_data: sessionState.quizData,
      current_question_index: sessionState.currentQuestionIndex,
      is_complete: sessionState.isComplete ?? false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,book' });
    return { error: error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

// ---------------- 인증/계정 ----------------
export const registerUser = async (email: string, password: string) => {
  // FIX: Corrected to supabase.auth.signUp() per Supabase JS v2 API.
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
};

export const loginUser = async (email: string, password: string) => {
  // FIX: Corrected to supabase.auth.signInWithPassword() per Supabase JS v2 API.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

export const logoutUser = async () => {
  // FIX: Corrected to supabase.auth.signOut() per Supabase JS v2 API.
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
      .select("progress")
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

export const testUpdateProgress = async () => {
    console.log("--- Running Progress Update Test ---");
    const testBook = `Test Book ${new Date().toLocaleTimeString()}`;
    const testSession: LearningSessionState = {
        topic: `${testBook} 1:1-5`,
        currentStep: LearningStep.TEST,
        messages: [{ role: 'user', content: 'test message' }, { role: 'model', content: 'test response' }],
        aiModel: 'gemini',
        bibleVerse: 'This is the test bible verse text.',
        score: 10,
        quizData: { topic: "Test Quiz", questions: [] },
        currentQuestionIndex: 0,
        isComplete: true,
        mode: 'general',
    };
    
    const testBookProgress: BookProgress = {
      lastSession: testSession,
      completionMarker: { book: testBook, chapter: 1, verse: 5 },
      totalCompletedVerses: 5
    };

    alert("Sending test update. Check your browser's developer console (F12) for detailed debug info.");
    
    const result = await updateUserProgress(testBook, testBookProgress);
    
    console.log("--- Progress Update Test Result ---", result);

    if (result.error) {
        console.error("Test Update Failed:", result.error);
        alert(`Test update failed: ${result.error}\n\nCheck the console for details.`);
    } else {
        console.log("Test Update Successful. 'After' state:", result.after);
        alert("Test update appears to have succeeded. Check the console to verify the 'before' and 'after' states.");
    }
};

export const sendPasswordResetEmail = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

export const updatePassword = async (password: string) => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
};
