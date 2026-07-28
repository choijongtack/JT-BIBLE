import React, { useReducer, useCallback, useEffect, useState } from 'react';
import type { AppStatus, LearningSessionState, Profile, Quiz, CompletionMarker } from './types';
import { LearningStep, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from './constants';
import { BIBLE_METADATA } from './services/bibleData';
import { parseReference, compareMarkers } from './services/bibleUtils';
import LoginScreen from './components/LoginScreen';
import ConversationalLearning from './components/LearningSession';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import AwaitingConfirmationScreen from './components/AwaitingConfirmationScreen';
import ProfileErrorScreen from './components/ProfileErrorScreen';
import PasswordResetScreen from './components/PasswordResetScreen';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import ProgressDebugPanel from './components/ProgressDebugPanel';
import { getStudyTopicForBook as getGeminiStudyTopic, getNextStudyTopic as getNextGeminiStudyTopic } from './services/geminiService';
import { getStudyTopicForBook as getPerplexityStudyTopic, getNextStudyTopic as getNextPerplexityStudyTopic } from './services/perplexityService';
import { getStudyTopicForBook as getChatGptStudyTopic, getNextStudyTopic as getNextChatGptStudyTopic } from './services/chatgptService';
import { getCompletedPassages, getStudySession, saveCompletedPassage, saveStudySession, updateUserProgress } from './services/userDataService';
import type { CompletedPassage } from './services/userDataService';
import type { BookProgress, AiModel } from './types';
import { getBibleVerse, getLastVerseInChapter, countVersesUpTo } from './services/bibleService';
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
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !bookName) return null;

    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
            aria-labelledby="book-completed-title"
        >
            <div
                className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-slate-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 sm:p-8 text-center">
                    <h2 id="book-completed-title" className="text-2xl font-bold text-slate-100 mb-4">학습 완료</h2>
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

type ProgressDebugInfo = {
    before: Profile['progress'] | null;
    request: Profile['progress'] | null;
    after: Profile['progress'] | null;
    error: string | null;
};

interface AppState {
    status: AppStatus;
    // FIX: Added the `isActionLoading` property to correctly type the application's state.
    isActionLoading: boolean;
    activeSession: LearningSessionState | null;
    lastSessionResult: {
        topic: string;
        exitType: 'save';
    } | null;
    error: string | null;
    loadingMessage: string;
    isDeleteConfirmOpen: boolean;
    completedBookModal: {
        isOpen: boolean;
        bookName: string | null;
    };
    progressDebugInfo: ProgressDebugInfo | null;
}

type AppAction =
    | { type: 'SET_AUTH_STATUS'; payload: AppStatus }
    | { type: 'SET_AUTH_ERROR'; payload: string | null }
    | { type: 'LOGIN_SUCCESS' }
    | { type: 'START_FEATURE_LOADING'; payload: string }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'START_LEARNING'; payload: LearningSessionState }
    | { type: 'UPDATE_LEARNING_STATE'; payload: LearningSessionState }
    | { type: 'FINISH_LEARNING'; payload: { debugInfo: ProgressDebugInfo } }
    | { type: 'SAVE_AND_EXIT'; payload: { topic: string; debugInfo: ProgressDebugInfo } }
    | { type: 'GO_TO_IDLE' }
    | { type: 'OPEN_DELETE_MODAL' }
    | { type: 'CLOSE_DELETE_MODAL' }
    | { type: 'OPEN_COMPLETED_MODAL'; payload: string }
    | { type: 'CLOSE_COMPLETED_MODAL' };

const initialState: AppState = {
    status: 'loading',
    isActionLoading: false, // 👈 초기값 설정
    activeSession: null,
    lastSessionResult: null,
    error: null,
    loadingMessage: '사용자의 세션/프로필 데이터를 로드하는 중...',
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
        // 2. 학습 시작 로직 (새로운 액션): status 대신 isActionLoading 사용
        case 'START_FEATURE_LOADING': 
            return {
                ...state,
                isActionLoading: true, // 👈 플래그만 true로 변경
                loadingMessage: action.payload,
            };

        // 3. 학습 종료 또는 세션 시작 실패 시 로직
//        case 'STOP_FEATURE_LOADING': // 학습 시작 실패 또는 취소 시 사용
//        case 'GO_TO_IDLE': // 기존 메인 화면 복귀 로직
//            return {
//                ...state,
//                status: 'idle',
//                isActionLoading: false, // 👈 플래그 해제
//                loadingMessage: '',
//            };
            
        case 'START_LEARNING': // 실제 학습 세션 시작
            return {
                ...state,
                status: 'learning',
                isActionLoading: false, // 👈 학습 화면 진입 시 플래그 해제
                activeSession: action.payload,
                loadingMessage: '',
            };    
//        case 'START_LOADING':
//            return { ...state, status: 'loading', loadingMessage: action.payload, error: null };
        case 'SET_ERROR':
            return { ...state, status: 'error', error: action.payload, progressDebugInfo: null, 
                isActionLoading: false, // 💡 [필수 확인]: 오류 발생 시 로딩 플래그 해제 
            };
//        case 'START_LEARNING':
//            return { ...state, status: 'learning', activeSession: action.payload };
        case 'UPDATE_LEARNING_STATE':
            return { ...state, activeSession: action.payload };
        case 'FINISH_LEARNING':
            return {
                ...state,
                status: 'idle',
                activeSession: null,
                lastSessionResult: null,
                isActionLoading: false, // 💡 [핵심 추가]: 학습 완료 시 로딩 플래그 해제
                progressDebugInfo: action.payload.debugInfo,
            };
        case 'SAVE_AND_EXIT':
            return {
                ...state,
                status: 'finished',
                activeSession: null,
                lastSessionResult: { topic: action.payload.topic, exitType: 'save' },
                progressDebugInfo: action.payload.debugInfo,
            };
        case 'GO_TO_IDLE':
            return { ...state, status: 'idle', activeSession: null, error: null, progressDebugInfo: null, lastSessionResult: null, isActionLoading: false, loadingMessage: '' };
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
    const [completedPassages, setCompletedPassages] = useState<CompletedPassage[] | null>(null);
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
        ,isPasswordRecovery
        ,requestPasswordReset
        ,resetPassword
        ,refreshProfile
    } = useProfileSession();

    useEffect(() => {
        if (authStatus === 'authenticated') {
            // This effect transitions the app to the 'idle' state after a successful login and profile load.
            // It's designed to run only once after authentication, not on every profile update.
            // By checking the current `status`, we prevent it from resetting the UI during active sessions (like 'learning' or 'finished').
            if (profile && (status === 'loading' || status === 'login' || status === 'awaiting-confirmation' || status === 'profile_error')) {
                dispatch({ type: 'LOGIN_SUCCESS' });
            }
        } else if (authStatus === 'unauthenticated') {
            dispatch({ type: 'SET_AUTH_STATUS', payload: 'login' });
        } else {
            dispatch({ type: 'SET_AUTH_STATUS', payload: authStatus });
        }
    }, [authStatus, profile, status]);

    useEffect(() => {
        if (authStatus !== 'authenticated') {
            setCompletedPassages(null);
            return;
        }
        getCompletedPassages().then(setCompletedPassages);
    }, [authStatus]);


    const resumeLearningSession = useCallback((sessionToResume: LearningSessionState, mode?: 'general' | 'advanced') => {
        dispatch({ type: 'START_FEATURE_LOADING', payload: `'${sessionToResume.topic}' 학습을 다시 시작합니다...` });
        const finalMode = mode ?? sessionToResume.mode ?? 'general';
        const sessionToStart = { ...sessionToResume, mode: finalMode };
        dispatch({ type: 'START_LEARNING', payload: sessionToStart });
    }, []);

    const startNewLearningSession = useCallback(async (book: string, aiModel: AiModel, mode: 'general' | 'advanced') => {
        try {
            const savedSession = profile?.progress?.[book]?.lastSession;
            const finalAiModel = aiModel;
            const finalMode = mode;
            
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
                        dispatch({ type: 'GO_TO_IDLE' });
                        return;
                    }
                }
            }
            
            dispatch({ type: 'START_FEATURE_LOADING', payload: `'${topicToGet}'${isNextTopic ? ' 다음' : '의 첫'} 주제를 찾는 중...` });

            if (finalAiModel === 'perplexity') {
                nextTopic = isNextTopic ? await getNextPerplexityStudyTopic(topicToGet, book) : await getPerplexityStudyTopic(topicToGet);
            } else if (finalAiModel === 'chatgpt') {
// FIX: Corrected a function call that was causing a runtime error.
// The `getNextChatGptStudyTopic` function expects two arguments, but was being called with one when a new session was started.
// This has been changed to `getChatGptStudyTopic`, which correctly handles fetching the first topic for a book.
                nextTopic = isNextTopic ? await getNextChatGptStudyTopic(topicToGet, book) : await getChatGptStudyTopic(topicToGet);
            } else {
                nextTopic = isNextTopic ? await getNextGeminiStudyTopic(topicToGet, book) : await getGeminiStudyTopic(topicToGet);
            }

            dispatch({ type: 'START_FEATURE_LOADING', payload: `'${nextTopic}' 본문을 불러오는 중...` });
            const verseResult = await getBibleVerse(nextTopic);

            if (verseResult.error) {
                console.warn(`AI가 제안한 토픽('${nextTopic}') 조회 실패. Fallback 로직 실행. 오류:`, verseResult.error);
                dispatch({ type: 'START_FEATURE_LOADING', payload: `AI 추천(${nextTopic})이 유효하지 않아 다음 주제를 직접 계산합니다...` });

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
                        const nextStart = lastStudiedVerse + 1;
                        const nextEnd = Math.min(nextStart + maxStep - 1, finalVerseInChapter);
                        const range = nextStart === nextEnd ? `${nextStart}` : `${nextStart}-${nextEnd}`;
                        correctedTopic = `${book} ${lastStudiedChapter}:${range}`;
                    } else if (lastStudiedChapter < bookMeta.chapters) {
                        const nextChapter = lastStudiedChapter + 1;
                        correctedTopic = `${book} ${nextChapter}:1-${maxStep}`;
                    } else {
                        dispatch({ type: 'OPEN_COMPLETED_MODAL', payload: book });
                        dispatch({ type: 'GO_TO_IDLE' });
                        return;
                    }
                }

                if (!correctedTopic) {
                    throw new Error(`AI가 잘못된 다음 주제('${nextTopic}')를 반환했으며, 시스템이 대체 주제를 생성하지 못했습니다.`);
                }

                nextTopic = correctedTopic;
                dispatch({ type: 'START_FEATURE_LOADING', payload: `대체 주제 '${nextTopic}' 본문을 불러오는 중...` });
                const retryResult = await getBibleVerse(nextTopic);
                if (retryResult.error) {
                    throw new Error(`대체 주제('${nextTopic}') 조회에 실패했습니다: ${retryResult.error}`);
                }
                bibleVerse = retryResult.text;

            } else {
                bibleVerse = verseResult.text;
            }

            const sessionToStart: LearningSessionState = {
                topic: nextTopic,
                currentStep: finalMode === 'advanced' ? LearningStep.ANALYSIS : LearningStep.OBSERVATION,
                messages: [],
                aiModel: finalAiModel,
                mode: finalMode,
                bibleVerse: bibleVerse,
                score: 0, quizData: null, currentQuestionIndex: 0
            };
            dispatch({ type: 'START_LEARNING', payload: sessionToStart });
        } catch (e) {
            const message = e instanceof Error ? e.message : '새 학습 세션을 시작하는 데 실패했습니다.';
            dispatch({ type: 'SET_ERROR', payload: message });
        }
    }, [profile]);

    const handleStartLearning = useCallback(async (book: string, aiModel?: AiModel, mode?: 'general' | 'advanced', customTopic?: string) => {
        const latestProfile = await refreshProfile();
        const currentProfile = latestProfile ?? profile;
        const normalizedCustomTopic = customTopic?.trim();
        if (normalizedCustomTopic) {
            const parsedCustomTopic = parseReference(normalizedCustomTopic);
            if (!parsedCustomTopic) {
                dispatch({ type: 'SET_ERROR', payload: `구절 형식이 올바르지 않습니다: ${normalizedCustomTopic}` });
                return;
            }

            const customBook = parsedCustomTopic.book;
            const savedCustomBookSession = currentProfile?.progress?.[customBook]?.lastSession;
            const finalAiModel = aiModel ?? savedCustomBookSession?.aiModel ?? 'gemini';
            const finalMode = mode ?? savedCustomBookSession?.mode ?? 'general';

            dispatch({ type: 'START_FEATURE_LOADING', payload: `'${normalizedCustomTopic}' 본문을 확인하는 중..` });
            const verseResult = await getBibleVerse(normalizedCustomTopic);
            if (verseResult.error || !verseResult.text) {
                dispatch({ type: 'SET_ERROR', payload: verseResult.error || `선택한 구절 '${normalizedCustomTopic}'을(를) 찾지 못했습니다.` });
                return;
            }

            const sessionToStart: LearningSessionState = {
                topic: normalizedCustomTopic,
                currentStep: finalMode === 'advanced' ? LearningStep.ANALYSIS : LearningStep.OBSERVATION,
                messages: [],
                aiModel: finalAiModel,
                mode: finalMode,
                bibleVerse: verseResult.text,
                score: 0,
                quizData: null,
                currentQuestionIndex: 0
            };
            dispatch({ type: 'START_LEARNING', payload: sessionToStart });
            return;
        }
        dispatch({ type: 'START_FEATURE_LOADING', payload: `'${book}' 학습을 준비하는 중...` });
    
        const savedBookProgress = currentProfile?.progress?.[book];
        const sessionTableValue = await getStudySession(book);
        let savedSession = sessionTableValue ?? savedBookProgress?.lastSession;
    
        if (savedSession && (typeof savedSession.topic !== 'string' || !savedSession.topic)) {
            savedSession = undefined;
        }
        
        const isInProgress = savedSession && !savedSession.isComplete;

        if (isInProgress) {
            // 진행 중인 세션이 있습니다.
            const isModeConflict = mode && savedSession.mode && savedSession.mode !== mode;
    
            if (isModeConflict) {
                // UI에서 이 경우가 발생하지 않도록 막지만, 안전장치로 로직을 추가합니다.
                // 충돌하는 모드 요청 시, 로딩 상태를 취소하고 아무것도 하지 않습니다.
                console.warn(`'${book}'에 대해 충돌하는 학습 모드로 시작하려는 시도가 무시되었습니다.`);
                dispatch({ type: 'GO_TO_IDLE' }); 
                return;
            }
            // 충돌이 없으므로 세션을 이어갑니다.
            resumeLearningSession(savedSession, mode ?? savedSession.mode);
        } else {
            // 진행 중인 세션이 없으므로 새 세션을 시작합니다.
            const finalAiModel = aiModel ?? savedSession?.aiModel ?? 'gemini';
            const finalMode = mode ?? savedSession?.mode ?? 'general';
            await startNewLearningSession(book, finalAiModel, finalMode);
        }
    }, [profile, refreshProfile, resumeLearningSession, startNewLearningSession]);

    const handleFinishLearning = useCallback(async () => {
        if (!activeSession || !profile || !activeSession.topic) {
            dispatch({ type: 'SET_ERROR', payload: "학습 세션을 완료할 수 없습니다: 유효하지 않은 세션 데이터입니다." });
            return;
        }
    
        dispatch({ type: 'START_FEATURE_LOADING', payload: `학습 결과를 저장하는 중...` });

        const book = getBookFromTopic(activeSession.topic);

        const parsedTopic = parseReference(activeSession.topic);
        if (!parsedTopic) {
            dispatch({ type: 'SET_ERROR', payload: `완료된 주제 형식이 잘못되었습니다: ${activeSession.topic}` });
            return;
        }

        const newMarker: CompletionMarker = {
            book: parsedTopic.book,
            chapter: parsedTopic.chapter,
            verse: parsedTopic.verses[parsedTopic.verses.length - 1],
        };

        const currentBookProgress = profile.progress?.[book];
        
        if (currentBookProgress && compareMarkers(newMarker, currentBookProgress.completionMarker) <= 0) {
            console.log("Re-learned a topic or an older topic. No progress update needed.");
            dispatch({ type: 'FINISH_LEARNING', payload: { debugInfo: { message: "Re-learned topic. No progress update needed." } } });
            return;
        }

        const { count, error: countError } = await countVersesUpTo(newMarker);
        if (countError) {
            dispatch({ type: 'SET_ERROR', payload: `진행률을 계산할 수 없습니다: ${countError}` });
            return;
        }
        
        const { topic, aiModel, mode } = activeSession;

        const sessionToSave: LearningSessionState = {
            topic,
            aiModel,
            mode,
            isComplete: true,
            currentStep: mode === 'advanced' ? LearningStep.ANALYSIS : LearningStep.OBSERVATION,
            messages: [],
            bibleVerse: null,
            quizData: null,
            currentQuestionIndex: 0,
            score: 0,
        };
        const sessionTableResult = await saveStudySession(book, sessionToSave);
        if (sessionTableResult.error) {
            console.warn('완료 세션 별도 저장에 실패했습니다. 기존 진행도 저장은 완료되었습니다.', sessionTableResult.error);
        }

        const newBookProgress: BookProgress = { 
            lastSession: sessionToSave, 
            completionMarker: newMarker, 
            totalCompletedVerses: count 
        };
        const result = await updateUserProgress(book, newBookProgress);

        if (result.error || !result.after) {
            // 💡 [수정]: 오류 발생 시 로딩 상태를 명시적으로 해제합니다.
            // FIX: Removed redundant `STOP_FEATURE_LOADING` dispatch.
            // The `SET_ERROR` action already handles resetting the loading state.
            dispatch({ type: 'SET_ERROR', payload: result.error || '진행 상황을 업데이트하는 데 실패했습니다.' });
            return;
        }

        setProfile(prev => prev ? { ...prev, progress: result.after! } : null);

        const passageStartVerse = parsedTopic.verses[0];
        const passageResult = await saveCompletedPassage({
            book: parsedTopic.book,
            chapter: parsedTopic.chapter,
            startVerse: passageStartVerse,
            endVerse: newMarker.verse,
        });
        if (passageResult.error) {
            console.warn('완료 구간 별도 저장에 실패했습니다. 기존 진행도 저장은 완료되었습니다.', passageResult.error);
        }
        const refreshedPassages = await getCompletedPassages();
        if (refreshedPassages) setCompletedPassages(refreshedPassages);

        dispatch({ type: 'FINISH_LEARNING', payload: { debugInfo: result } });

    }, [activeSession, profile, setProfile]);

    const saveCurrentSession = useCallback(async (isSystemBack: boolean = false) => {
        if (!activeSession || !profile || !activeSession.topic) {
            dispatch({ type: 'GO_TO_IDLE' });
            return;
        }

        const book = getBookFromTopic(activeSession.topic);
        const currentBookProgress = profile.progress?.[book] || { 
            lastSession: activeSession, 
            completionMarker: null, 
            totalCompletedVerses: 0 
        };
        const sessionToSave = { ...activeSession, isComplete: false };
        const newBookProgress: BookProgress = { ...currentBookProgress, lastSession: sessionToSave };
        const result = await updateUserProgress(book, newBookProgress);

        if (result.error || !result.after) {
            dispatch({ type: 'SET_ERROR', payload: result.error || '진행 상황을 업데이트하는 데 실패했습니다.' });
            return;
        }

        setProfile(prev => prev ? { ...prev, progress: result.after! } : null);

        const sessionTableResult = await saveStudySession(book, sessionToSave);
        if (sessionTableResult.error) {
            console.warn('진행 중 세션 별도 저장에 실패했습니다. 기존 진행도 저장은 완료되었습니다.', sessionTableResult.error);
        }

        if (isSystemBack) {
            dispatch({ type: 'GO_TO_IDLE' });
        } else {
            dispatch({ type: 'SAVE_AND_EXIT', payload: { topic: activeSession.topic, debugInfo: result } });
        }
    }, [activeSession, profile, setProfile]);

    const handleExitLearning = useCallback(async () => {
        dispatch({ type: 'GO_TO_IDLE' });
    }, [dispatch]);
    
    const handleStateChange = useCallback(async (newState: LearningSessionState) => {
        dispatch({ type: 'UPDATE_LEARNING_STATE', payload: newState });
    }, [dispatch]);

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
        dispatch({ type: 'START_FEATURE_LOADING', payload: '계정을 삭제하는 중입니다...' });
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
            case 'idle':
                // Show a generic spinner only when loading with an active session (e.g., saving).
                if (status === 'loading' && activeSession) {
                    return (
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-slate-300">{loadingMessage}</p>
                        </div>
                    );
                }
                // For 'idle' or 'loading' without an active session, render WelcomeScreen.
                // WelcomeScreen will handle its own loading overlay based on the 'status' prop.
                return (
                    <WelcomeScreen
                        status={status}
                        loadingMessage={loadingMessage}
                        // 💡 [핵심 추가]: state에서 isActionLoading을 Prop으로 전달합니다.
                        isActionLoading={state.isActionLoading} 
                        onStart={handleStartLearning}
                        profile={profile}
                        completedPassages={completedPassages}
                        onLogout={logout}
                        onDelete={() => dispatch({ type: 'OPEN_DELETE_MODAL' })}
                        onGptKeySaved={handleGptKeySaved}
                        onPerplexityKeySaved={handlePerplexityKeySaved}
                        onGptKeyDeleted={() => setProfile(prev => prev ? { ...prev, chatgpt_api_key: undefined } : null)}
                        onPerplexityKeyDeleted={() => setProfile(prev => prev ? { ...prev, perplexity_api_key: undefined } : null)}
                    />
                );
            case 'login':
                return isPasswordRecovery ? <PasswordResetScreen onSubmit={resetPassword} onBack={() => window.location.reload()} /> : <LoginScreen onLogin={login} onRegister={register} onResetPassword={requestPasswordReset} error={authError} />;
            case 'awaiting-confirmation':
                return <AwaitingConfirmationScreen onBackToLogin={() => dispatch({ type: 'SET_AUTH_STATUS', payload: 'login' })} />;
            case 'profile_error':
                 return <ProfileErrorScreen error={authError || "알 수 없는 프로필 오류가 발생했습니다."} onLogout={logout} />;
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
                if (!lastSessionResult) {
                     dispatch({ type: 'GO_TO_IDLE' });
                     return null;
                }
                return <ResultsScreen lastResult={lastSessionResult} onRestart={() => dispatch({ type: 'GO_TO_IDLE' })} progressDebugInfo={progressDebugInfo} />;
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
