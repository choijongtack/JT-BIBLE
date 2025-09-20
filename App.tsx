import React, { useReducer, useCallback, useEffect } from 'react';
import type { AppStatus, LearningSessionState, Profile, Quiz } from './types';
import { LearningStep, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from './constants';
import { BIBLE_METADATA } from './services/bibleData';
import { parseReference } from './services/bibleUtils';
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
import { updateUserProgress, saveActiveSession } from './services/userDataService';
import { encrypt } from './services/encryptionService';
import type { BookProgress, AiModel } from './types';
import { getBibleVerse } from './services/bibleService';
import { useProfileSession } from './hooks/useProfileSession';

// A robust function to extract the correct Bible book name from a topic string.
const ALL_BOOKS = [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS].sort((a, b) => b.length - a.length);

const getBookFromTopic = (topic: string): string => {
    if (!topic || typeof topic !== 'string') return 'Unknown';
    const foundBook = ALL_BOOKS.find(bookName => topic.trim().startsWith(bookName));
    return foundBook || topic.split(' ')[0];
};

// --- State Management with useReducer ---

interface AppState {
    status: AppStatus;
    activeSession: LearningSessionState | null;
    lastSessionResult: {
        score: number;
        total: number;
        topic: string;
        exitType: 'quiz' | 'save';
    };
    error: string | null;
    loadingMessage: string;
    isDeleteConfirmOpen: boolean;
    progressDebugInfo: {
        before: Profile['progress'] | null;
        request: Profile['progress'] | null;
        after: Profile['progress'] | null;
        error: string | null;
    } | null;
}

type AppAction =
    | { type: 'SET_AUTH_STATUS'; payload: AppStatus }
    | { type: 'SET_AUTH_ERROR'; payload: string | null }
    | { type: 'LOGIN_SUCCESS'; payload: { activeSession: LearningSessionState | null } }
    | { type: 'START_LOADING'; payload: string }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'START_LEARNING'; payload: LearningSessionState }
    | { type: 'UPDATE_LEARNING_STATE'; payload: LearningSessionState }
    | { type: 'FINISH_LEARNING'; payload: { score: number; total: number; topic: string; debugInfo: any } }
    | { type: 'SAVE_AND_EXIT'; payload: { topic: string; debugInfo: any } }
    | { type: 'GO_TO_IDLE' }
    | { type: 'RESUME_SESSION' }
    | { type: 'DISCARD_SESSION' }
    | { type: 'OPEN_DELETE_MODAL' }
    | { type: 'CLOSE_DELETE_MODAL' };

const initialState: AppState = {
    status: 'loading',
    activeSession: null,
    lastSessionResult: { score: 0, total: 0, topic: '', exitType: 'quiz' },
    error: null,
    loadingMessage: '앱을 초기화하고 Supabase에 연결하는 중...',
    isDeleteConfirmOpen: false,
    progressDebugInfo: null,
};

const appReducer = (state: AppState, action: AppAction): AppState => {
    switch (action.type) {
        case 'SET_AUTH_STATUS':
            return { ...state, status: action.payload, loadingMessage: '' };
        case 'SET_AUTH_ERROR':
            return { ...state, error: action.payload }; // This could be used for login/register errors
        case 'LOGIN_SUCCESS':
            return {
                ...state,
                activeSession: action.payload.activeSession,
                status: action.payload.activeSession ? 'session-prompt' : 'idle',
            };
        case 'START_LOADING':
            return { ...state, status: 'loading', loadingMessage: action.payload, error: null };
        case 'SET_ERROR':
            return { ...state, status: 'error', error: action.payload, progressDebugInfo: null };
        case 'START_LEARNING':
            return { ...state, status: 'learning', activeSession: action.payload };
        case 'UPDATE_LEARNING_STATE':
            return { ...state, activeSession: action.payload };
        case 'FINISH_LEARNING':
            return {
                ...state,
                status: 'finished',
                activeSession: null,
                lastSessionResult: { ...action.payload, exitType: 'quiz' },
                progressDebugInfo: action.payload.debugInfo,
            };
        case 'SAVE_AND_EXIT':
            return {
                ...state,
                status: 'finished',
                activeSession: null,
                lastSessionResult: { score: -1, total: 0, topic: action.payload.topic, exitType: 'save' },
                progressDebugInfo: action.payload.debugInfo,
            };
        case 'GO_TO_IDLE':
            return { ...state, status: 'idle', activeSession: null, error: null, progressDebugInfo: null };
        case 'RESUME_SESSION':
            return { ...state, status: 'learning' };
        case 'DISCARD_SESSION':
            return { ...state, status: 'idle', activeSession: null };
        case 'OPEN_DELETE_MODAL':
            return { ...state, isDeleteConfirmOpen: true };
        case 'CLOSE_DELETE_MODAL':
            return { ...state, isDeleteConfirmOpen: false };
        default:
            return state;
    }
};

const App: React.FC = () => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const { status, activeSession, lastSessionResult, error, loadingMessage, isDeleteConfirmOpen, progressDebugInfo } = state;

    const {
        authStatus,
        session,
        profile,
        authError,
        login,
        register,
        logout,
        deleteAccount,
        setProfile,
        setAuthError
    } = useProfileSession();

    // FIX: Correctly map `AuthStatus` to the appropriate `AppStatus` or action. The previous implementation caused a type error by dispatching `authStatus` values like 'authenticated' and 'unauthenticated', which are not valid `AppStatus` values. This logic now correctly handles each authentication state.
    useEffect(() => {
        if (authStatus === 'authenticated') {
            // When authenticated, the LOGIN_SUCCESS action determines the next app state ('idle' or 'session-prompt').
            // We don't dispatch SET_AUTH_STATUS directly.
            if (profile) {
                dispatch({ type: 'LOGIN_SUCCESS', payload: { activeSession: profile.active_learning_session } });
            }
        } else if (authStatus === 'unauthenticated') {
            // Map 'unauthenticated' from the auth hook to the 'login' screen state.
            dispatch({ type: 'SET_AUTH_STATUS', payload: 'login' });
        } else {
            // Handle statuses that are common between AuthStatus and AppStatus:
            // 'loading', 'awaiting-confirmation', 'profile_error'
            dispatch({ type: 'SET_AUTH_STATUS', payload: authStatus });
        }
    }, [authStatus, profile]);


    const handleStartLearning = useCallback(async (book: string, aiModel?: AiModel, apiKey?: string, mode?: 'general' | 'advanced') => {
        dispatch({ type: 'START_LOADING', payload: `'${book}' 학습을 준비하는 중...` });

        try {
            const savedBookProgress = profile?.progress?.[book];
            let savedSession = savedBookProgress?.lastSession;

            if (savedSession && (typeof savedSession.topic !== 'string' || !savedSession.topic)) {
                savedSession = undefined;
            }

            let sessionToStart: LearningSessionState;
            const newMode = mode || savedSession?.mode || 'general';

            if (savedSession && !savedSession.isComplete) {
                dispatch({ type: 'START_LOADING', payload: `'${savedSession.topic}' 학습을 다시 시작합니다...` });
                sessionToStart = { ...savedSession, mode: newMode };
            } else {
                let nextTopic: string;
                let bibleVerse: string | null;
                
                const isNextTopic = savedSession?.isComplete;
                const topicToGet = isNextTopic ? savedSession.topic : book;
                
                if (isNextTopic) {
                    const lastTopicRef = parseReference(topicToGet);
                    const bookMeta = BIBLE_METADATA[book];

                    if (lastTopicRef && bookMeta) {
                        const lastVerse = lastTopicRef.verses[lastTopicRef.verses.length - 1];
                        if (lastTopicRef.chapter === bookMeta.chapters && lastVerse >= bookMeta.versesInLastChapter) {
                            alert(`'${book}'의 학습을 모두 완료하셨습니다.`);
                            dispatch({ type: 'GO_TO_IDLE' });
                            return;
                        }
                    }
                }
                
                dispatch({ type: 'START_LOADING', payload: `'${topicToGet}'${isNextTopic ? ' 다음' : '의 첫'} 주제를 찾는 중...` });
                const newSelectedModel = aiModel || 'gemini';

                if (newSelectedModel === 'perplexity' && apiKey) {
                    nextTopic = isNextTopic ? await getNextPerplexityStudyTopic(topicToGet, apiKey, book) : await getPerplexityStudyTopic(topicToGet, apiKey);
                } else if (newSelectedModel === 'chatgpt') {
                    nextTopic = isNextTopic ? await getNextChatGptStudyTopic(topicToGet, book) : await getChatGptStudyTopic(topicToGet);
                } else {
                    nextTopic = isNextTopic ? await getNextGeminiStudyTopic(topicToGet, book) : await getGeminiStudyTopic(topicToGet);
                }

                dispatch({ type: 'START_LOADING', payload: `'${nextTopic}' 본문을 불러오는 중...` });
                const verseResult = await getBibleVerse(nextTopic);

                if (verseResult.error) {
                    console.warn(`AI가 제안한 토픽('${nextTopic}') 조회 실패. Fallback 로직 실행. 오류:`, verseResult.error);
                    dispatch({ type: 'START_LOADING', payload: `AI 추천(${nextTopic})이 유효하지 않아 마지막 절을 직접 계산합니다...` });

                    let correctedTopic: string | null = null;
                    const lastTopicRef = parseReference(topicToGet);
                    const bookMeta = BIBLE_METADATA[book];

                    if (lastTopicRef && bookMeta && lastTopicRef.chapter === bookMeta.chapters) {
                        const lastStudiedVerse = lastTopicRef.verses[lastTopicRef.verses.length - 1];
                        const finalVerseInBook = bookMeta.versesInLastChapter;
                        
                        if (lastStudiedVerse < finalVerseInBook) {
                            const nextStart = lastStudiedVerse + 1;
                            correctedTopic = `${book} ${lastTopicRef.chapter}:${nextStart}-${finalVerseInBook}`;
                        }
                    }
                    
                    if (!correctedTopic) {
                        throw new Error(`AI가 잘못된 다음 주제('${nextTopic}')를 반환했으며, 시스템이 대체 주제를 생성하지 못했습니다.`);
                    }

                    nextTopic = correctedTopic;
                    dispatch({ type: 'START_LOADING', payload: `'${nextTopic}' 본문을 다시 불러오는 중...` });
                    const retryResult = await getBibleVerse(nextTopic);
                    if (retryResult.error) {
                        throw new Error(`대체 주제('${nextTopic}') 조회에 실패했습니다: ${retryResult.error}`);
                    }
                    bibleVerse = retryResult.text;

                } else {
                    bibleVerse = verseResult.text;
                }

                let encryptedApiKey: string | undefined = apiKey;
                if (apiKey && aiModel === 'perplexity') {
                    if (!session?.access_token) throw new Error("API 키를 암호화하기 위한 인증 토큰을 찾을 수 없습니다.");
                    encryptedApiKey = await encrypt(apiKey, session.access_token);
                }

                sessionToStart = {
                    topic: nextTopic,
                    currentStep: LearningStep.ANALYSIS,
                    messages: [],
                    aiModel: aiModel || 'gemini',
                    mode: newMode,
                    apiKey: aiModel === 'perplexity' ? encryptedApiKey : undefined,
                    bibleVerse: bibleVerse,
                    score: 0, quizData: null, currentQuestionIndex: 0
                };
            }
            dispatch({ type: 'START_LEARNING', payload: sessionToStart });
        } catch (e) {
            const message = e instanceof Error ? e.message : '학습 세션을 시작하는 데 실패했습니다.';
            dispatch({ type: 'SET_ERROR', payload: message });
        }
    }, [profile, session]);

    const handleFinishLearning = useCallback(async (score: number, total: number) => {
        if (!activeSession || !profile || !activeSession.topic) {
            dispatch({ type: 'SET_ERROR', payload: "학습 세션을 완료할 수 없습니다: 유효하지 않은 세션 데이터입니다." });
            return;
        }

        const book = getBookFromTopic(activeSession.topic);
        const currentBookProgress = profile.progress?.[book] || { lastSession: activeSession, completedTopics: [] };
        
        // FIX: Explicitly typed the Set as Set<string> to resolve a TypeScript inference
        // error where `Array.from` would otherwise produce `unknown[]` instead of `string[]`.
        // This ensures type safety when updating the user's progress.
        const completedTopicsSet = new Set<string>(currentBookProgress.completedTopics);
        completedTopicsSet.add(activeSession.topic);

        const sessionToSave: LearningSessionState = {
            ...activeSession, isComplete: true, messages: [], bibleVerse: null,
            currentStep: LearningStep.ANALYSIS, quizData: null, currentQuestionIndex: 0, score: 0
        };

        const newBookProgress: BookProgress = { lastSession: sessionToSave, completedTopics: Array.from(completedTopicsSet) };
        const result = await updateUserProgress(book, newBookProgress);

        if (result.error || !result.after) {
            dispatch({ type: 'SET_ERROR', payload: result.error || '진행 상황을 업데이트하는 데 실패했습니다.' });
            return;
        }

        setProfile(prev => prev ? { ...prev, progress: result.after!, active_learning_session: null } : null);
        await saveActiveSession(null);
        dispatch({ type: 'FINISH_LEARNING', payload: { score, total, topic: activeSession.topic, debugInfo: result } });

    }, [activeSession, profile, setProfile]);

    const saveCurrentSession = useCallback(async (isSystemBack: boolean = false) => {
        if (!activeSession || !profile || !activeSession.topic) {
            dispatch({ type: 'GO_TO_IDLE' });
            return;
        }

        const book = getBookFromTopic(activeSession.topic);
        const currentBookProgress = profile.progress?.[book] || { lastSession: activeSession, completedTopics: [] };
        const sessionToSave = { ...activeSession, isComplete: false };
        const newBookProgress: BookProgress = { ...currentBookProgress, lastSession: sessionToSave };
        const result = await updateUserProgress(book, newBookProgress);

        if (result.error || !result.after) {
            dispatch({ type: 'SET_ERROR', payload: result.error || '진행 상황을 업데이트하는 데 실패했습니다.' });
            return;
        }

        setProfile(prev => prev ? { ...prev, progress: result.after!, active_learning_session: null } : null);
        await saveActiveSession(null);

        if (isSystemBack) {
            dispatch({ type: 'GO_TO_IDLE' });
        } else {
            dispatch({ type: 'SAVE_AND_EXIT', payload: { topic: activeSession.topic, debugInfo: result } });
        }
    }, [activeSession, profile, setProfile]);

    const handleExitLearning = useCallback(async () => {
        if (profile?.id) {
            await saveActiveSession(null);
        }
        dispatch({ type: 'GO_TO_IDLE' });
    }, [profile?.id]);
    
    const handleStateChange = useCallback(async (newState: LearningSessionState) => {
        dispatch({ type: 'UPDATE_LEARNING_STATE', payload: newState });
        if (profile?.id) await saveActiveSession(newState);
    }, [profile?.id]);

    const handleGptKeySaved = useCallback(() => {
        setProfile(prev => {
            if (!prev) return null;
            return { ...prev, chatgpt_api_key: 'key_saved_placeholder' };
        });
    }, [setProfile]);

    const handleDiscard = useCallback(() => {
        if(profile?.id) saveActiveSession(null);
        dispatch({ type: 'DISCARD_SESSION' });
    }, [profile?.id]);

    const executeDelete = useCallback(async () => {
        dispatch({ type: 'CLOSE_DELETE_MODAL' });
        dispatch({ type: 'START_LOADING', payload: '계정을 삭제하는 중입니다...' });
        try {
            await deleteAccount();
        } catch (e) {
            const message = e instanceof Error ? e.message : '계정 삭제 실패';
            if (message.includes("Auth session missing")) {
                await logout(); // Force logout
            } else {
                dispatch({ type: 'SET_ERROR', payload: message });
            }
        }
    }, [deleteAccount, logout]);

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
                return <LoginScreen onLogin={login} onRegister={register} error={authError} />;
            case 'awaiting-confirmation':
                return <AwaitingConfirmationScreen onBackToLogin={() => dispatch({ type: 'SET_AUTH_STATUS', payload: 'login' })} />;
            case 'profile_error':
                 return <ProfileErrorScreen error={authError || "알 수 없는 프로필 오류가 발생했습니다."} onLogout={logout} />;
            case 'idle':
                return (
                    <WelcomeScreen onStart={handleStartLearning} profile={profile} onLogout={logout} onDelete={() => dispatch({ type: 'OPEN_DELETE_MODAL' })} onGptKeySaved={handleGptKeySaved} />
                );
            case 'session-prompt':
                if (!activeSession) {
                    dispatch({ type: 'GO_TO_IDLE' });
                    return null;
                }
                return <ResumeSessionPrompt session={activeSession} onResume={() => dispatch({ type: 'RESUME_SESSION' })} onDiscard={handleDiscard} />;
            case 'learning':
                if (!activeSession) {
                     dispatch({ type: 'GO_TO_IDLE' });
                     return null;
                }
                return <ConversationalLearning
                    savedSession={activeSession}
                    onStateChange={handleStateChange}
                    onFinish={handleFinishLearning}
                    onBack={handleExitLearning}
                    onSaveAndExit={() => saveCurrentSession(false)}
                    onSkip={handleExitLearning}
                    onSystemBack={() => saveCurrentSession(true)}
                />;
            case 'finished':
                return <ResultsScreen lastResult={lastSessionResult} onRestart={() => dispatch({ type: 'GO_TO_IDLE' })} onContinue={handleStartLearning} progressDebugInfo={progressDebugInfo} />;
            case 'error':
                return (
                    <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl mx-auto">
                        <h2 className="text-3xl font-bold text-red-400 mb-4">오류가 발생했습니다</h2>
                        <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap">{error}</pre>
                        <button onClick={() => dispatch({ type: 'GO_TO_IDLE' })} className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all">
                            메인 화면으로 돌아가기
                        </button>
                        <ProgressDebugPanel debugInfo={progressDebugInfo} />
                    </div>
                );
        }
    };

    return (
        <div className="relative min-h-screen w-full font-sans antialiased">
            {/* 배경 이미지 */}
            <div className="fixed inset-0 z-0">
                <img 
                  src="https://images.unsplash.com/photo-1517090510947-30c819a56e80?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiaWJsZSUyMGJvb2slMjBvcGVuJTIwcGFnZXN8ZW58MXx8fHwxNzU4MjU1OTI0fDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="성경책 배경"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/85 to-slate-900/90"></div>
            </div>

            {/* 콘텐츠 */}
            <main className="relative z-10 w-full min-h-screen flex items-center justify-center p-4">
                {renderContent()}
            </main>

            <DeleteConfirmationModal isOpen={isDeleteConfirmOpen} onConfirm={executeDelete} onCancel={() => dispatch({ type: 'CLOSE_DELETE_MODAL' })} />
        </div>
    );
};

export default App;