import React, { useReducer, useCallback, useEffect } from 'react';
import type { AppStatus, LearningSessionState, Profile, Quiz } from './types';
import { LearningStep, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from './constants';
import { BIBLE_METADATA } from './services/bibleData';
import { parseReference } from './services/bibleUtils';
import LoginScreen from './components/LoginScreen';
import ConversationalLearning from './components/LearningSession';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import AwaitingConfirmationScreen from './components/AwaitingConfirmationScreen';
import ProfileErrorScreen from './components/ProfileErrorScreen';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import ProgressDebugPanel from './components/ProgressDebugPanel';
import { getStudyTopicForBook as getGeminiStudyTopic, getNextStudyTopic as getNextGeminiStudyTopic, generatePrayerForTopic as generateGeminiPrayer } from './services/geminiService';
import { getStudyTopicForBook as getPerplexityStudyTopic, getNextStudyTopic as getNextPerplexityStudyTopic, generatePrayerForTopic as generatePerplexityPrayer } from './services/perplexityService';
import { getStudyTopicForBook as getChatGptStudyTopic, getNextStudyTopic as getNextChatGptStudyTopic, generatePrayerForTopic as generateChatGptPrayer } from './services/chatgptService';
import { updateUserProgress } from './services/userDataService';
import type { BookProgress, AiModel } from './types';
import { getBibleVerse, getLastVerseInChapter } from './services/bibleService';
import { useProfileSession } from './hooks/useProfileSession';


// A robust function to extract the correct Bible book name from a topic string.
const ALL_BOOKS = [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS].sort((a, b) => b.length - a.length);

const getBookFromTopic = (topic: string): string => {
    if (!topic || typeof topic !== 'string') return 'Unknown';
    const foundBook = ALL_BOOKS.find(bookName => topic.trim().startsWith(bookName));
    return foundBook || topic.split(' ')[0];
};

// --- 학습 완료 안내 모달 ---
interface BookCompletedModalProps {
    isOpen: boolean;
    onClose: () => void;
    bookName: string | null;
}

const BookCompletedModal: React.FC<BookCompletedModalProps> = ({ isOpen, onClose, bookName }) => {
    if (!isOpen || !bookName) return null;

    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
                className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-slate-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 sm:p-8 text-center">
                    <h2 className="text-2xl font-bold text-slate-100 mb-4">학습 완료</h2>
                    <p className="text-slate-300">
                        '{bookName}'의 학습을 모두 완료하셨습니다.
                        <br />
                        다른 책을 선택하여 학습을 계속해주세요.
                    </p>
                </div>
                <div className="flex p-4 bg-slate-900/50 rounded-b-2xl">
                     <button
                        onClick={onClose}
                        className="w-full px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 transition-colors"
                     >
                        확인
                     </button>
                </div>
            </div>
        </div>
    );
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
        prayerText: string | null;
    };
    error: string | null;
    loadingMessage: string;
    isDeleteConfirmOpen: boolean;
    completedBookModal: {
        isOpen: boolean;
        bookName: string | null;
    };
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
    | { type: 'LOGIN_SUCCESS' }
    | { type: 'START_LOADING'; payload: string }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'START_LEARNING'; payload: LearningSessionState }
    | { type: 'UPDATE_LEARNING_STATE'; payload: LearningSessionState }
    | { type: 'FINISH_LEARNING'; payload: { score: number; total: number; topic: string; prayerText: string | null; debugInfo: any } }
    | { type: 'SAVE_AND_EXIT'; payload: { topic: string; debugInfo: any } }
    | { type: 'GO_TO_IDLE' }
    | { type: 'OPEN_DELETE_MODAL' }
    | { type: 'CLOSE_DELETE_MODAL' }
    | { type: 'OPEN_COMPLETED_MODAL'; payload: string }
    | { type: 'CLOSE_COMPLETED_MODAL' };

const initialState: AppState = {
    status: 'loading',
    activeSession: null,
    lastSessionResult: { score: 0, total: 0, topic: '', exitType: 'quiz', prayerText: null },
    error: null,
    loadingMessage: '앱을 초기화하고 Supabase에 연결하는 중...',
    isDeleteConfirmOpen: false,
    completedBookModal: { isOpen: false, bookName: null },
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
                activeSession: null,
                status: 'idle',
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
                lastSessionResult: { score: -1, total: 0, topic: action.payload.topic, exitType: 'save', prayerText: null },
                progressDebugInfo: action.payload.debugInfo,
            };
        case 'GO_TO_IDLE':
            return { ...state, status: 'idle', activeSession: null, error: null, progressDebugInfo: null };
        case 'OPEN_DELETE_MODAL':
            return { ...state, isDeleteConfirmOpen: true };
        case 'CLOSE_DELETE_MODAL':
            return { ...state, isDeleteConfirmOpen: false };
        case 'OPEN_COMPLETED_MODAL':
            return { ...state, status: 'idle', completedBookModal: { isOpen: true, bookName: action.payload } };
        case 'CLOSE_COMPLETED_MODAL':
            return { ...state, completedBookModal: { isOpen: false, bookName: null } };
        default:
            return state;
    }
};

const App: React.FC = () => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const { status, activeSession, lastSessionResult, error, loadingMessage, isDeleteConfirmOpen, completedBookModal, progressDebugInfo } = state;

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
                dispatch({ type: 'LOGIN_SUCCESS' });
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


    const handleStartLearning = useCallback(async (book: string, aiModel?: AiModel, mode?: 'general' | 'advanced') => {
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
                            dispatch({ type: 'OPEN_COMPLETED_MODAL', payload: book });
                            return;
                        }
                    }
                }
                
                dispatch({ type: 'START_LOADING', payload: `'${topicToGet}'${isNextTopic ? ' 다음' : '의 첫'} 주제를 찾는 중...` });
                const newSelectedModel = aiModel || 'gemini';

                if (newSelectedModel === 'perplexity') {
                    nextTopic = isNextTopic ? await getNextPerplexityStudyTopic(topicToGet, book) : await getPerplexityStudyTopic(topicToGet);
                } else if (newSelectedModel === 'chatgpt') {
                    // FIX: Corrected a typo where `getNextChatGptStudyTopic` was called with one argument instead of `getChatGptStudyTopic`.
                    nextTopic = isNextTopic ? await getNextChatGptStudyTopic(topicToGet, book) : await getChatGptStudyTopic(topicToGet);
                } else {
                    nextTopic = isNextTopic ? await getNextGeminiStudyTopic(topicToGet, book) : await getGeminiStudyTopic(topicToGet);
                }

                dispatch({ type: 'START_LOADING', payload: `'${nextTopic}' 본문을 불러오는 중...` });
                const verseResult = await getBibleVerse(nextTopic);

                if (verseResult.error) {
                    console.warn(`AI가 제안한 토픽('${nextTopic}') 조회 실패. Fallback 로직 실행. 오류:`, verseResult.error);
                    dispatch({ type: 'START_LOADING', payload: `AI 추천(${nextTopic})이 유효하지 않아 다음 주제를 직접 계산합니다...` });

                    let correctedTopic: string | null = null;
                    const lastTopicRef = parseReference(topicToGet);
                    const bookMeta = BIBLE_METADATA[book];
                    const maxStep = 5;

                    if (lastTopicRef && bookMeta) {
                        const lastStudiedChapter = lastTopicRef.chapter;
                        const lastStudiedVerse = lastTopicRef.verses[lastTopicRef.verses.length - 1];

                        const { lastVerse: finalVerseInChapter, error: verseError } = await getLastVerseInChapter(book, lastStudiedChapter);

                        if (verseError || finalVerseInChapter === null) {
                            throw new Error(`다음 주제를 계산하지 못했습니다: ${book} ${lastStudiedChapter}의 마지막 절을 찾을 수 없습니다. 오류: ${verseError}`);
                        }

                        if (lastStudiedVerse < finalVerseInChapter) {
                            // We are in the same chapter
                            const nextStart = lastStudiedVerse + 1;
                            const nextEnd = Math.min(nextStart + maxStep - 1, finalVerseInChapter);
                            const range = nextStart === nextEnd ? `${nextStart}` : `${nextStart}-${nextEnd}`;
                            correctedTopic = `${book} ${lastStudiedChapter}:${range}`;
                        } else if (lastStudiedChapter < bookMeta.chapters) {
                            // We need to move to the next chapter
                            const nextChapter = lastStudiedChapter + 1;
                            correctedTopic = `${book} ${nextChapter}:1-${maxStep}`;
                        } else {
                            // This is the last verse of the last chapter. The book is complete.
                            dispatch({ type: 'OPEN_COMPLETED_MODAL', payload: book });
                            return; // exit the function
                        }
                    }

                    if (!correctedTopic) {
                        throw new Error(`AI가 잘못된 다음 주제('${nextTopic}')를 반환했으며, 시스템이 대체 주제를 생성하지 못했습니다.`);
                    }

                    nextTopic = correctedTopic;
                    dispatch({ type: 'START_LOADING', payload: `대체 주제 '${nextTopic}' 본문을 불러오는 중...` });
                    const retryResult = await getBibleVerse(nextTopic);
                    if (retryResult.error) {
                        throw new Error(`대체 주제('${nextTopic}') 조회에 실패했습니다: ${retryResult.error}`);
                    }
                    bibleVerse = retryResult.text;

                } else {
                    bibleVerse = verseResult.text;
                }

                sessionToStart = {
                    topic: nextTopic,
                    currentStep: LearningStep.ANALYSIS,
                    messages: [],
                    aiModel: aiModel || 'gemini',
                    mode: newMode,
                    bibleVerse: bibleVerse,
                    score: 0, quizData: null, currentQuestionIndex: 0
                };
            }
            dispatch({ type: 'START_LEARNING', payload: sessionToStart });
        } catch (e) {
            const message = e instanceof Error ? e.message : '학습 세션을 시작하는 데 실패했습니다.';
            dispatch({ type: 'SET_ERROR', payload: message });
        }
    }, [profile]);

    const handleFinishLearning = useCallback(async (score: number, total: number) => {
        if (!activeSession || !profile || !activeSession.topic) {
            dispatch({ type: 'SET_ERROR', payload: "학습 세션을 완료할 수 없습니다: 유효하지 않은 세션 데이터입니다." });
            return;
        }
    
        dispatch({ type: 'START_LOADING', payload: `'${activeSession.topic}'에 대한 기도문을 생성 중입니다...` });

        let prayerText: string | null = null;
        try {
            switch (activeSession.aiModel) {
                case 'perplexity':
                    prayerText = await generatePerplexityPrayer(activeSession.topic, activeSession.mode);
                    break;
                case 'chatgpt':
                    prayerText = await generateChatGptPrayer(activeSession.topic, activeSession.mode);
                    break;
                case 'gemini':
                default:
                    prayerText = await generateGeminiPrayer(activeSession.topic, activeSession.mode);
                    break;
            }
        } catch (e) {
            console.warn("기도문 생성에 실패했습니다:", e);
            // Do not block the user flow if prayer generation fails.
            prayerText = null; 
        }

        dispatch({ type: 'START_LOADING', payload: `학습 결과를 저장하는 중...` });

        const book = getBookFromTopic(activeSession.topic);
        const currentBookProgress = profile.progress?.[book] || { lastSession: activeSession, completedTopics: [] };
        
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

        setProfile(prev => prev ? { ...prev, progress: result.after! } : null);
        dispatch({ type: 'FINISH_LEARNING', payload: { score, total, topic: activeSession.topic, prayerText, debugInfo: result } });

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

        setProfile(prev => prev ? { ...prev, progress: result.after! } : null);

        if (isSystemBack) {
            dispatch({ type: 'GO_TO_IDLE' });
        } else {
            dispatch({ type: 'SAVE_AND_EXIT', payload: { topic: activeSession.topic, debugInfo: result } });
        }
    }, [activeSession, profile, setProfile]);

    const handleExitLearning = useCallback(async () => {
        dispatch({ type: 'GO_TO_IDLE' });
    }, [profile?.id]);
    
    const handleStateChange = useCallback(async (newState: LearningSessionState) => {
        dispatch({ type: 'UPDATE_LEARNING_STATE', payload: newState });
    }, [profile?.id]);

    const handleGptKeySaved = useCallback(() => {
        setProfile(prev => {
            if (!prev) return null;
            return { ...prev, chatgpt_api_key: 'key_saved_placeholder' };
        });
    }, [setProfile]);
    
    const handlePerplexityKeySaved = useCallback(() => {
        setProfile(prev => {
            if (!prev) return null;
            return { ...prev, perplexity_api_key: 'key_saved_placeholder' };
        });
    }, [setProfile]);

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
                    <WelcomeScreen 
                        onStart={handleStartLearning} 
                        profile={profile} 
                        onLogout={logout} 
                        onDelete={() => dispatch({ type: 'OPEN_DELETE_MODAL' })} 
                        onGptKeySaved={handleGptKeySaved}
                        onPerplexityKeySaved={handlePerplexityKeySaved}
                    />
                );
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
            <BookCompletedModal
                isOpen={completedBookModal.isOpen}
                bookName={completedBookModal.bookName}
                onClose={() => dispatch({ type: 'CLOSE_COMPLETED_MODAL' })}
            />
        </div>
    );
};

export default App;