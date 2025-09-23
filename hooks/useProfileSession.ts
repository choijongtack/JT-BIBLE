// FIX: Imported `React` to resolve the 'Cannot find namespace React' error. The `React.SetStateAction` type requires the `React` namespace, which was not previously in scope.
import React, { useState, useEffect, useCallback } from 'react';
import type { AppStatus, Profile } from '../types';
import { getProfile, createProfile, loginUser, registerUser, deleteUserAccount, logoutUser } from '../services/userDataService';
import { supabase } from '../services/supabaseClient';
import type { Session } from '@supabase/supabase-js';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'awaiting-confirmation' | 'profile_error';

export const useProfileSession = () => {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);

            if (!session?.user) {
                setProfile(null);
                if (authStatus !== 'awaiting-confirmation') {
                    setAuthStatus('unauthenticated');
                }
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
            const message = e instanceof Error ? e.message : '로그인 실패';
            setAuthError(message);
            throw e;
        }
    }, []);

    const register = useCallback(async (email: string, password: string) => {
        setAuthError(null);
        try {
            await registerUser(email, password);
            setAuthStatus('awaiting-confirmation');
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
    
    // Allow App component to update profile state after progress saves
    const updateProfile = useCallback((newProfile: React.SetStateAction<Profile | null>) => {
        setProfile(newProfile);
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
    };
};
