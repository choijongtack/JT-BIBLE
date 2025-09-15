import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { AppStatus, LearningSessionState, Profile, Quiz } from './types';
import { LearningStep, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from './constants';
import LoginScreen from './components/LoginScreen';
import ConversationalLearning from './components/LearningSession';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import ResumeSessionPrompt from './components/ResumeSessionPrompt';
import AwaitingConfirmationScreen from './components/AwaitingConfirmationScreen';
import ProfileErrorScreen from './components/ProfileErrorScreen';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import ProgressDebugPanel from './components/ProgressDebugPanel';
import { getStudyTopicForBook as getGeminiStudyTopic, getNextStudyTopic as getNextGeminiStudyTopic } from './services/geminiService';
import { getStudyTopicForBook as getPerplexityStudyTopic, getNextStudyTopic as getNextPerplexityStudyTopic } from './services/perplexityService';
import { getStudyTopicForBook as getChatGptStudyTopic, getNextStudyTopic as getNextChatGptStudyTopic } from './services/chatgptService';
import { getProfile, updateUserProgress, saveActiveSession, logoutUser, createProfile, deleteUserAccount, loginUser, registerUser } from './services/userDataService';
import { supabase } from './services/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import { encrypt, decrypt } from './services/encryptionService';
import type { BookProgress, AiModel } from './types';

// A robust function to extract the correct Bible book name from a topic string.
// It compares the topic against the full list of Bible books to avoid errors
// with numbered books (e.g., "요한1서") or multi-word names.
const ALL_BOOKS = [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS].sort((a, b) => b.length - a.length);

const getBookFromTopic = (topic: string): string => {
    if (!topic || typeof topic !== 'string') {
        // Return a default or handle error appropriately.
        return 'Unknown';
    }
    // Find the book name that the topic string starts with.
    // The list is sorted by length descending to match longer names first (e.g., "요한1서" before "요한").
    const foundBook = ALL_BOOKS.find(bookName => topic.trim().startsWith(bookName));

    // Fallback to the old logic if no match is found, which should be rare.
    return foundBook || topic.split(' ')[0];
};


const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>('loading');
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [activeSession, setActiveSession] = useState<LearningSessionState | null>(null);
    const [lastSessionResult, setLastSessionResult] = useState<{
        score: number;
        total: number;
        topic: string;
        exitType: 'quiz' | 'save';
    }>({ score: 0, total: 0, topic: '', exitType: 'quiz' });
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string>('앱을 초기화하고 Supabase에 연결하는 중...');
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [progressDebugInfo, setProgressDebugInfo] = useState<{
        before: Profile['progress'] | null;
        request: Profile['progress'] | null;
        after: Profile['progress'] | null;
        error: string | null;
    } | null>(null);
    
    const statusRef = useRef(status);
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session && (statusRef.current === 'login' || statusRef.current === 'loading' || statusRef.current === 'awaiting-confirmation')) {
                setLoadingMessage('인증 상태 변경 감지됨...');
            }
            
            if (!session?.user) {
                setSession(null);
                setProfile(null);
                setActiveSession(null);
                if (statusRef.current !== 'awaiting-confirmation' && statusRef.current !== 'profile_error') {
                    setStatus('login');
                }
                return;
            }
            
            if (statusRef.current === 'profile_error') return;

            if (statusRef.current !== 'loading') {
                setStatus('loading');
            }

            setLoadingMessage('세션 확인됨. 프로필 조회 시도 중...');
            setAuthError(null);
            try {
                let userProfile = await getProfile();
                
                if (!userProfile) {
                    setLoadingMessage('기존 프로필 없음. 신규 프로필 생성 시도 중...');
                    userProfile = await createProfile(session.user.email);
                    if (userProfile) {
                        setLoadingMessage('신규 프로필 생성 성공.');
                    }
                } else {
                     setLoadingMessage('기존 프로필을 성공적으로 불러왔습니다.');
                }

                if (!userProfile) {
                    throw new Error("사용자 프로필을 가져오거나 생성하는 데 최종적으로 실패했습니다.");
                }

                setLoadingMessage('프로필 확인 완료. 앱 상태 설정 중...');
                setSession(session);
                setProfile(userProfile);
                
                if (
                    userProfile.active_learning_session &&
                    typeof userProfile.active_learning_session === 'object' &&
                    userProfile.active_learning_session !== null &&
                    typeof (userProfile.active_learning_session as any).topic === 'string' &&
                    (userProfile.active_learning_session as any).topic.length > 0
                ) {
                    setLoadingMessage('진행 중인 학습 세션을 발견했습니다.');
                    setActiveSession(userProfile.active_learning_session as LearningSessionState);
                    setStatus('session-prompt');
                } else {
                    setLoadingMessage('준비 완료. 환영 화면으로 이동합니다.');
                    setActiveSession(null);
                    if (userProfile.id && userProfile.active_learning_session) {
                        console.warn("Clearing invalid active session data from profile:", userProfile.active_learning_session);
                        await saveActiveSession(null);
                    }
                    setStatus('idle');
                }
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : "프로필을 로드하는 동안 알 수 없는 오류가 발생했습니다.";
                console.error("Profile loading/creation failed:", errorMessage);
                
                setError(errorMessage);
                setStatus('profile_error');
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleLogin = useCallback(async (email: string, password: string) => {
        try {
            setAuthError(null);
            await loginUser(email, password);
        } catch (e) {
            setAuthError(e instanceof Error ? e.message : '로그인 실패');
            throw e;
        }
    }, []);

    const handleRegister = useCallback(async (email: string, password: string) => {
        try {
            setAuthError(null);
            await registerUser(email, password);
            setStatus('awaiting-confirmation');
        } catch (e) {
            setAuthError(e instanceof Error ? e.message : '가입 실패');
            throw e;
        }
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            await logoutUser();
            setSession(null);
            setProfile(null);
            setActiveSession(null);
            setStatus('login');
        } catch (e) {
            setError(e instanceof Error ? e.message : '로그아웃 실패');
            setStatus('error');
        }
    }, []);

    const executeDeleteUser = useCallback(async () => {
        setIsDeleteConfirmOpen(false);
        setStatus('loading');
        setLoadingMessage('계정을 삭제하는 중입니다...');
        try {
            await deleteUserAccount();
            await handleLogout();
        } catch (e) {
            setError(e instanceof Error ? e.message : '계정 삭제에 실패했습니다.');
            setStatus('error');
        }
    }, [handleLogout]);

    const handleDeleteUser = useCallback(() => {
        if (!profile) return;
        setIsDeleteConfirmOpen(true);
    }, [profile]);
    
    const handleStartLearning = useCallback(async (book: string, aiModel?: AiModel, apiKey?: string) => {
        setStatus('loading');
        setError(null);

        try {
            const savedBookProgress = profile?.progress?.[book];
            let savedSession = savedBookProgress?.lastSession;

            if (savedSession && (typeof savedSession.topic !== 'string' || !savedSession.topic)) {
                console.warn(`Saved session for "${book}" is missing a valid topic. A new session will be started.`, savedSession);
                savedSession = undefined;
            }

            let sessionToStart: LearningSessionState;

            if (savedSession) {
                if (savedSession.isComplete) {
                    // This is not resuming, but starting the NEXT session for the same book.
                    // The user's new AI model selection should apply.
                    setLoadingMessage(`'${savedSession.topic}' 이후의 학습 주제를 찾는 중...`);
                    const newSelectedModel = aiModel || 'gemini';
            
                    let nextTopic: string;
                    if (newSelectedModel === 'perplexity' && apiKey) {
                        nextTopic = await getNextPerplexityStudyTopic(savedSession.topic, apiKey);
                    } else if (newSelectedModel === 'chatgpt') {
                        nextTopic = await getNextChatGptStudyTopic(savedSession.topic);
                    } else {
                        nextTopic = await getNextGeminiStudyTopic(savedSession.topic);
                    }
                    
                    let encryptedApiKey: string | undefined = apiKey;
                    if (apiKey && newSelectedModel === 'perplexity') {
                        if (!session?.access_token) throw new Error("API 키를 암호화하기 위한 인증 토큰을 찾을 수 없습니다.");
                        encryptedApiKey = await encrypt(apiKey, session.access_token);
                    }
            
                    sessionToStart = {
                        topic: nextTopic,
                        currentStep: LearningStep.ANALYSIS,
                        messages: [],
                        aiModel: newSelectedModel,
                        apiKey: newSelectedModel === 'perplexity' ? encryptedApiKey : undefined,
                        bibleVerse: null,
                        score: 0,
                        quizData: null,
                        currentQuestionIndex: 0
                    };
                } else {
                    // This is resuming an incomplete session. The old session state (including AI model) is preserved.
                    setLoadingMessage(`'${savedSession.topic}' 학습을 다시 시작합니다...`);
                    sessionToStart = savedSession;
                }
            } else {
                setLoadingMessage(`'${book}'의 첫 학습 주제를 찾는 중...`);
                 let firstTopic: string;
                if (aiModel === 'perplexity' && apiKey) {
                    firstTopic = await getPerplexityStudyTopic(book, apiKey);
                } else if (aiModel === 'chatgpt') {
                    firstTopic = await getChatGptStudyTopic(book);
                } else {
                    firstTopic = await getGeminiStudyTopic(book);
                }
                
                let encryptedApiKey: string | undefined = apiKey;
                if (apiKey && (aiModel === 'perplexity')) { // Only Perplexity key is encrypted and stored in session state
                    if (!session?.access_token) throw new Error("API 키를 암호화하기 위한 인증 토큰을 찾을 수 없습니다.");
                    encryptedApiKey = await encrypt(apiKey, session.access_token);
                }

                sessionToStart = {
                    topic: firstTopic,
                    currentStep: LearningStep.ANALYSIS,
                    messages: [],
                    aiModel: aiModel || 'gemini',
                    apiKey: aiModel === 'perplexity' ? encryptedApiKey : undefined,
                    bibleVerse: null,
                    score: 0,
                    quizData: null,
                    currentQuestionIndex: 0
                };
            }
            
            setActiveSession(sessionToStart);
            setStatus('learning');

        } catch (e) {
            setError(e instanceof Error ? e.message : '학습 세션을 시작하는 데 실패했습니다.');
            setStatus('error');
        }
    }, [profile, session]);

    const handleFinishLearning = useCallback(async (score: number, total: number) => {
        if (!activeSession || !profile || typeof activeSession.topic !== 'string' || !activeSession.topic) {
            console.error("handleFinishLearning called with invalid activeSession or missing topic.", activeSession);
            setError("학습 세션을 완료할 수 없습니다: 유효하지 않은 세션 데이터입니다.");
            setStatus('error');
            return;
        }

        setProgressDebugInfo(null); 

        const book = getBookFromTopic(activeSession.topic);
        
        const currentBookProgress = profile.progress?.[book] || {
            lastSession: activeSession,
            completedTopics: []
        };

        const completedTopicsSet = new Set(currentBookProgress.completedTopics);
        completedTopicsSet.add(activeSession.topic);

        const sessionToSave: LearningSessionState = { 
            ...activeSession, 
            isComplete: true,
            messages: [], 
            bibleVerse: null,
            currentStep: LearningStep.ANALYSIS,
            quizData: null,
            currentQuestionIndex: 0,
            score: 0
        };

        const newBookProgress: BookProgress = {
            lastSession: sessionToSave,
            completedTopics: Array.from(completedTopicsSet)
        };

        const result = await updateUserProgress(book, newBookProgress);
        setProgressDebugInfo(result);

        if (result.error || !result.after) {
            const errorMessage = result.error || '진행 상황을 업데이트하는 데 실패했습니다.';
            setError(errorMessage);
            setStatus('error');
            return;
        }

        setProfile(prev => prev ? { ...prev, progress: result.after } : null);
        
        setLastSessionResult({ score, total, topic: activeSession.topic, exitType: 'quiz' });
        setActiveSession(null);
        if (profile?.id) {
            await saveActiveSession(null);
        }
        setStatus('finished');
    }, [activeSession, profile]);
    
    const saveCurrentSession = useCallback(async () => {
        if (!activeSession || !profile || typeof activeSession.topic !== 'string' || !activeSession.topic) {
            setActiveSession(null);
            if (profile?.id) await saveActiveSession(null);
            return { success: false, fromError: false, result: null };
        }
    
        const sessionTopic = activeSession.topic;
    
        const book = getBookFromTopic(sessionTopic);
        
        const currentBookProgress = profile.progress?.[book] || {
            lastSession: activeSession,
            completedTopics: []
        };
    
        const sessionToSave = { ...activeSession, isComplete: false };
        
        const newBookProgress: BookProgress = {
            ...currentBookProgress,
            lastSession: sessionToSave
        };
    
        const result = await updateUserProgress(book, newBookProgress);
    
        if (result.error || !result.after) {
            const errorMessage = result.error || '진행 상황을 업데이트하는 데 실패했습니다.';
            setError(errorMessage);
            return { success: false, fromError: true, result };
        }
    
        setProfile(prev => prev ? { ...prev, progress: result.after } : null);
        await saveActiveSession(null);
        setActiveSession(null);
        return { success: true, topic: sessionTopic, result };
    
    }, [activeSession, profile]);

    const handleSaveAndExit = useCallback(async () => {
        const { success, fromError, topic, result } = await saveCurrentSession();
        setProgressDebugInfo(result);

        if (success) {
            setLastSessionResult({
                score: -1, 
                total: 0,
                topic: topic || '',
                exitType: 'save'
            });
            setStatus('finished');
        } else if (fromError) {
            setStatus('error');
        } else {
            setStatus('idle');
        }
    }, [saveCurrentSession]);

    const handleSystemBack = useCallback(async () => {
        const { fromError, result } = await saveCurrentSession();
        if (fromError) {
            setProgressDebugInfo(result);
            setStatus('error');
        } else {
            setStatus('idle');
        }
    }, [saveCurrentSession]);


    const handleSkipTest = useCallback(async () => {
        if (!activeSession) {
            setStatus('idle');
            return;
        }
    
        // 세션이 삭제되었으므로 활성 세션을 지웁니다.
        setActiveSession(null);
        if (profile?.id) {
            await saveActiveSession(null);
        }
        
        // 메인 화면으로 돌아갑니다.
        setStatus('idle');
    }, [activeSession, profile?.id]);

    const handleStateChange = useCallback(async (newState: LearningSessionState) => {
        setActiveSession(newState);
        if (profile?.id) {
            await saveActiveSession(newState);
        }
    }, [profile?.id]);

    const handleRestart = useCallback(() => {
        setStatus('idle');
        setActiveSession(null);
        setLastSessionResult({ score: 0, total: 0, topic: '', exitType: 'quiz' });
    }, []);
    
    const handleResume = useCallback(() => {
        setStatus('learning');
    }, []);
    
    const handleDiscard = useCallback(() => {
        setActiveSession(null);
        if(profile?.id) {
          saveActiveSession(null).then(() => {
             setStatus('idle');
          });
        } else {
           setStatus('idle');
        }
    }, [profile?.id]);

    const handleBackToMain = useCallback(() => {
        setError(null);
        setStatus('idle');
    }, []);

    const handleGptKeySaved = useCallback(() => {
        setProfile(prev => {
            if (!prev) return null;
            // Add a placeholder to indicate the key is saved.
            // The WelcomeScreen useEffect will see this and switch to 'saved' mode.
            return { ...prev, chatgpt_api_key: 'key_saved_placeholder' };
        });
    }, []);
    

    const renderContent = () => {
        switch (status) {
            case 'loading':
                return (
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-slate-300">{loadingMessage}</p>
                    </div>
                );
            case 'login':
                return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} error={authError} />;
            case 'awaiting-confirmation':
                return <AwaitingConfirmationScreen onBackToLogin={() => setStatus('login')} />;
            case 'profile_error':
                 return <ProfileErrorScreen error={error || "알 수 없는 프로필 오류가 발생했습니다."} onLogout={handleLogout} />;
            case 'idle':
                return (
                    <div className="w-full min-h-screen flex items-center justify-center p-4">
                        <WelcomeScreen 
                            onStart={handleStartLearning} 
                            profile={profile}
                            onLogout={handleLogout}
                            onDelete={handleDeleteUser}
                            onGptKeySaved={handleGptKeySaved}
                        />
                    </div>
                );
            case 'session-prompt':
                if (!activeSession) {
                    setStatus('idle');
                    return null;
                }
                return <ResumeSessionPrompt session={activeSession} onResume={handleResume} onDiscard={handleDiscard} />;
            case 'learning':
                if (!activeSession) {
                     setStatus('idle');
                     return null;
                }
                return <ConversationalLearning 
                    savedSession={activeSession} 
                    onStateChange={handleStateChange}
                    onFinish={handleFinishLearning}
                    onBack={handleBackToMain}
                    onSaveAndExit={handleSaveAndExit}
                    onSkip={handleSkipTest}
                    onSystemBack={handleSystemBack}
                />;
            case 'finished':
                return <ResultsScreen 
                    lastResult={lastSessionResult}
                    onRestart={handleRestart}
                    onContinue={handleStartLearning}
                    progressDebugInfo={progressDebugInfo}
                />;
            case 'error':
                return (
                    <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl mx-auto">
                        <h2 className="text-3xl font-bold text-red-400 mb-4">오류가 발생했습니다</h2>
                        <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap">{error}</pre>
                        <button
                            onClick={handleBackToMain}
                            className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
                        >
                            메인 화면으로 돌아가기
                        </button>
                        <ProgressDebugPanel debugInfo={progressDebugInfo} />
                    </div>
                );
        }
    };

    return (
        <main className="w-full min-h-screen flex items-center justify-center p-4 font-sans antialiased">
            {renderContent()}
            <DeleteConfirmationModal
                isOpen={isDeleteConfirmOpen}
                onConfirm={executeDeleteUser}
                onCancel={() => setIsDeleteConfirmOpen(false)}
            />
        </main>
    );
};

export default App;