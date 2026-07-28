// FIX: Imported `React` to resolve the 'Cannot find namespace React' error. The `React.SetStateAction` type requires the `React` namespace, which was not previously in scope.
import React, { useState, useEffect, useCallback } from 'react';
import type { AppStatus, Profile } from '../types';
import { getProfile, createProfile, loginUser, registerUser, deleteUserAccount, logoutUser, sendPasswordResetEmail, updatePassword } from '../services/userDataService';
import { supabase } from '../services/supabaseClient';
// FIX: Changed import from Session to AuthSession and aliased as Session. In some versions of supabase-js, the session type was exported as AuthSession.
import type { AuthSession as Session } from '@supabase/supabase-js';

const EMAIL_CONFIRMATION_REQUIRED = false;

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'awaiting-confirmation' | 'profile_error';

export const useProfileSession = () => {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
    const [authError, setAuthError] = useState<string | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

    useEffect(() => {
        // FIX: Corrected to supabase.auth.onAuthStateChange() per Supabase JS v2 API.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);

            if (_event === 'PASSWORD_RECOVERY') {
                setIsPasswordRecovery(true);
                setAuthStatus('unauthenticated');
                return;
            }

            if (!session?.user) {
                setProfile(null);
                if (authStatus !== 'awaiting-confirmation') {
                    setAuthStatus('unauthenticated');
                }
                return;
            }
            
            // After a user signs up with email confirmation enabled, Supabase sends a 'SIGNED_IN'
            // event with a session, but the user's email is not yet confirmed. This block
            // catches that specific case to prevent the app from treating it as a full login.
            // It ensures the 'awaiting-confirmation' screen is shown.
            if (
                EMAIL_CONFIRMATION_REQUIRED &&
                _event === 'SIGNED_IN' &&
                !session.user.email_confirmed_at
            ) {
                setAuthStatus('awaiting-confirmation');
                return;
            }

            if (profile?.id === session.user.id) {
                return; // Profile already loaded, likely a token refresh.
            }

            setAuthStatus('loading');
            setAuthError(null);

            try {
                let userProfile = await getProfile();
                if (!userProfile) {
                    userProfile = await createProfile(session.user.email);
                }

                if (!userProfile) {
                    throw new Error("사용자 프로필을 가져오거나 생성하는 데 최종적으로 실패했습니다.");
                }

                setProfile(userProfile);
                setAuthStatus('authenticated');
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : "프로필을 로드하는 동안 알 수 없는 오류가 발생했습니다.";
                setAuthError(errorMessage);
                setAuthStatus('profile_error');
            }
        });

        return () => subscription.unsubscribe();
    }, [profile, authStatus]);

    const login = useCallback(async (email: string, password: string) => {
        setAuthError(null);
        try {
            await loginUser(email, password);
        } catch (e) {
            let message = e instanceof Error ? e.message : '로그인 실패';
            if (message === 'Invalid login credentials') {
                message = '신규 사용자 이시네요. 가입 후 사용바랍니다.';
            }
            setAuthError(message);
            throw e;
        }
    }, []);

    const register = useCallback(async (email: string, password: string) => {
        setAuthError(null);
        try {
            await registerUser(email, password);
            if (!EMAIL_CONFIRMATION_REQUIRED) {
                try {
                    await logoutUser();
                } catch (logoutError) {
                    console.warn('Auto logout after registration failed', logoutError);
                } finally {
                    setSession(null);
                    setProfile(null);
                }
            }
            setAuthStatus(EMAIL_CONFIRMATION_REQUIRED ? 'awaiting-confirmation' : 'login');
        } catch (e) {
            const message = e instanceof Error ? e.message : '가입 실패';
            setAuthError(message);
            throw e;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await logoutUser();
        } catch (e) {
            console.warn("로그아웃 실패 또는 세션 만료. 클라이언트 상태만 초기화합니다.", e);
        } finally {
            setSession(null);
            setProfile(null);
            setAuthStatus('unauthenticated');
            setAuthError(null);
        }
    }, []);

    const deleteAccount = useCallback(async () => {
        try {
            await deleteUserAccount();
            await logout();
        } catch (e) {
            if (e instanceof Error && e.message.includes("Auth session missing")) {
                console.warn("세션 만료 상태에서 계정 삭제 시도 → 강제 로그아웃");
                await logout();
            } else {
                 throw e;
            }
        }
    }, [logout]);

    const requestPasswordReset = useCallback(async (email: string) => {
        await sendPasswordResetEmail(email);
    }, []);

    const resetPassword = useCallback(async (password: string) => {
        await updatePassword(password);
    }, [logout]);
    
    // Allow App component to update profile state after progress saves
    const updateProfile = useCallback((newProfile: React.SetStateAction<Profile | null>) => {
        setProfile(newProfile);
    }, []);

    const refreshProfile = useCallback(async (): Promise<Profile | null> => {
        try {
            const latestProfile = await getProfile();
            if (latestProfile) setProfile(latestProfile);
            return latestProfile;
        } catch (error) {
            console.warn('최신 프로필을 불러오지 못했습니다. 현재 프로필을 사용합니다.', error);
            return null;
        }
    }, []);

    return {
        session,
        profile,
        authStatus,
        authError,
        login,
        register,
        logout,
        deleteAccount,
        setProfile: updateProfile,
        setAuthError
        ,isPasswordRecovery
        ,requestPasswordReset
        ,resetPassword
        ,refreshProfile
    };
};
