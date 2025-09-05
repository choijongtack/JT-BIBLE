import { supabase } from './supabaseClient';
import type { LearningSessionState, UserProgress, Profile } from '../types';
import type { User } from '@supabase/supabase-js';

const API_TIMEOUT = 15000; // 15 seconds

// FIX: The original `withTimeout<T>(promise: PromiseLike<T>)` had trouble with TypeScript's
// type inference for Supabase's "thenable" query builders. It often inferred `T` as `{}`,
// causing destructuring errors (e.g., `const { data, error } = ...`).
// This updated signature uses `<P extends PromiseLike<any>>` and `Promise<Awaited<P>>`.
// `Awaited<P>` correctly extracts the resolved type from the Supabase promise-like object,
// ensuring that `data`, `error`, and `status` are known to exist.
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

export const registerUser = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // The on_auth_user_created trigger in Supabase is expected to create a profile.
    // The client now has a fallback to create it if the trigger fails.
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
        // 'error'는 FunctionsError입니다. 더 구체적인 메시지를 추출해 봅시다.
        // 실제 응답 본문은 종종 'context' 속성에 있습니다.
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

    // 함수가 2xx 상태를 반환했지만 응답 본문에 오류를 포함하는 경우를 대비한 추가 확인.
    if (data && data.error) {
        console.error('Error deleting user account (from data object):', data.error);
        throw new Error(`계정 삭제에 실패했습니다: ${data.error}`);
    }
    
    // 성공 응답에 예상된 메시지가 없는 경우를 확인합니다.
    if (!data || !data.message) {
         console.error('Unexpected response from delete-user function:', data);
         throw new Error('사용자 삭제 중 예기치 않은 응답을 받았습니다.');
    }
};


export const getProfile = async (user: User): Promise<Profile | null> => {
    try {
        const promise = supabase
            .from('profiles')
            .select(`*`)
            .eq('id', user.id)
            .single();
        
        const { data, error, status } = await withTimeout(promise, API_TIMEOUT);
        
        if (error && status !== 406) {
            // A 406 status indicates no rows were found, which is a valid scenario.
            // We don't throw an error for that, just return null.
            console.error('Error fetching profile:', error.message);
            throw error;
        }
        
        return data;
    } catch (error) {
        // This catch block is for network errors or unexpected issues.
        console.error("An exception occurred while fetching the profile:", error);
        throw error;
    }
}

export const createProfile = async (userId: string, email?: string): Promise<Profile> => {
    try {
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
            // Handle race condition: if profile was created by the trigger between our check and insert.
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


export const updateUserProgress = async (userId: string, book: string, newTopic: string, currentProgress: UserProgress): Promise<UserProgress> => {
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


export const saveActiveSession = async (userId: string, session: LearningSessionState | null) => {
    const promise = supabase
        .from('profiles')
        .update({ active_learning_session: session, updated_at: new Date().toISOString() })
        .eq('id', userId);

    const { error } = await withTimeout(promise, API_TIMEOUT);

    if (error) {
        console.error('Error saving active session:', error.message);
        throw error;
    }
};