import React, { useState, useEffect, useCallback } from 'react';

// Hooks
import { useProfileSession } from './hooks/useProfileSession';

// Components
import LoginScreen from './components/LoginScreen';
import WelcomeScreen from './components/WelcomeScreen';
import LearningSession from './components/LearningSession';
import ResultsScreen from './components/ResultsScreen';
import AwaitingConfirmationScreen from './components/AwaitingConfirmationScreen';
import ProfileErrorScreen from './components/ProfileErrorScreen';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import { IconLoader } from './constants';

// Services
import { getStudyTopicForBook as getGeminiTopic } from './services/geminiService';
import { getStudyTopicForBook as getPerplexityTopic } from './services/perplexityService';
import { getStudyTopicForBook as getChatGptTopic } from './services/chatgptService';
import { updateUserProgress } from './services/userDataService';
import { countVersesUpTo } from './services/bibleService';
import { parseReference, compareMarkers } from './services/bibleUtils';

// Types
import type { AppStatus, Profile, LearningSessionState, AiModel, BookProgress } from './types';
import type { ProgressDebugInfo } from './services/userDataService';
import { LearningStep } from './constants';

const LoadingScreen = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-white text-center">
    <IconLoader className="w-12 h-12 animate-spin text-blue-400" />
    <p className="mt-4 text-lg">{message}</p>
  </div>
);

function App() {
  const { profile, authStatus, authError, login, register, logout, deleteAccount, setProfile } = useProfileSession();
  const [appStatus, setAppStatus] = useState<AppStatus>('login');
  const [learningSession, setLearningSession] = useState<LearningSessionState | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('앱을 초기화하는 중...');
  const [lastResult, setLastResult] = useState<{ topic: string; exitType: 'save' } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [progressDebugInfo, setProgressDebugInfo] = useState<ProgressDebugInfo | null>(null);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      setAppStatus('login');
      setLearningSession(null);
    } else if (authStatus === 'awaiting-confirmation') {
      setAppStatus('awaiting-confirmation');
    } else if (authStatus === 'profile_error') {
      setAppStatus('profile_error');
    } else if (authStatus === 'authenticated' && appStatus !== 'learning' && appStatus !== 'finished' && appStatus !== 'loading') {
      setAppStatus('idle');
    }
  }, [authStatus, appStatus]);

  const getTopicForBook = (book: string, aiModel: AiModel) => {
    switch (aiModel) {
      case 'perplexity': return getPerplexityTopic(book);
      case 'chatgpt': return getChatGptTopic(book);
      case 'gemini':
      default: return getGeminiTopic(book);
    }
  };

  const startNewLearningSession = useCallback((book: string, aiModel: AiModel, mode: 'general' | 'advanced') => {
    setAppStatus('loading');
    setLoadingMessage(`'${book}'에 대한 학습 주제를 생성 중입니다...`);
    setProgressDebugInfo(null);
    
    // Use setTimeout to ensure the loading screen renders before the async operation starts
    setTimeout(async () => {
        try {
            const topic = await getTopicForBook(book, aiModel);
            const newSession: LearningSessionState = {
                topic,
                currentStep: mode === 'general' ? LearningStep.OBSERVATION : LearningStep.ANALYSIS,
                messages: [],
                aiModel,
                mode,
                bibleVerse: null,
                score: 0,
                quizData: null,
                currentQuestionIndex: 0,
                isComplete: false,
            };
            setLearningSession(newSession);
            // This final state change is also wrapped to ensure rendering consistency
            setTimeout(() => setAppStatus('learning'), 50);
        } catch (err) {
            alert(`학습 주제를 가져오는 데 실패했습니다: ${err instanceof Error ? err.message : String(err)}`);
            setAppStatus('idle');
        }
    }, 50);
  }, []);

  const handleStart = useCallback((book: string, aiModel: AiModel, mode: 'general' | 'advanced' = 'general') => {
    if (!profile) return;
    const savedBookProgress = profile.progress?.[book];
    const lastSession = savedBookProgress?.lastSession;

    if (lastSession && !lastSession.isComplete) {
      const resume = window.confirm(`'${lastSession.topic}'에 대해 진행 중인 학습이 있습니다. 이어서 하시겠습니까?`);
      if (resume) {
        setAppStatus('loading');
        setLoadingMessage(`'${lastSession.topic}' 학습을 이어갑니다...`);
        setTimeout(() => {
            setLearningSession(lastSession);
            setAppStatus('learning');
        }, 50);
      } else {
        startNewLearningSession(book, aiModel, mode);
      }
    } else {
      startNewLearningSession(book, aiModel, mode);
    }
  }, [profile, startNewLearningSession]);

  const handleSaveAndExit = useCallback(async (state: LearningSessionState) => {
    if (!profile) return;
    const { topic } = state;
    const parsedRef = parseReference(topic);
    if (!parsedRef) return;
    
    const bookProgress: BookProgress = {
      lastSession: state,
      completionMarker: profile.progress?.[parsedRef.book]?.completionMarker || null,
      totalCompletedVerses: profile.progress?.[parsedRef.book]?.totalCompletedVerses || 0,
    };
    
    const debugInfo = await updateUserProgress(parsedRef.book, bookProgress);
    setProgressDebugInfo(debugInfo);
    
    if (debugInfo.error) {
      alert(`저장에 실패했습니다: ${debugInfo.error}\n\n콘솔에서 자세한 정보를 확인하세요.`);
    } else {
      setProfile(prev => (prev ? ({ ...prev, progress: { ...(prev.progress || {}), [parsedRef.book]: bookProgress } }) : null));
      setLastResult({ topic, exitType: 'save' });
      setAppStatus('finished');
      setLearningSession(null);
    }
  }, [profile, setProfile]);

  const handleFinish = useCallback(async (finalState: LearningSessionState) => {
    if (!profile) return;
    
    setAppStatus('loading');
    setLoadingMessage('학습 진행률을 업데이트하는 중입니다...');

    const parsedRef = parseReference(finalState.topic);
    if (!parsedRef) {
      alert("잘못된 주제 형식으로 인해 진행률을 저장할 수 없습니다.");
      setAppStatus('idle');
      return;
    }
    
    const bookName = parsedRef.book;
    const currentProgress = profile.progress?.[bookName];
    const newMarker = { book: bookName, chapter: parsedRef.chapter, verse: parsedRef.verses[parsedRef.verses.length - 1] };
    
    // Only update marker if new one is further along
    const finalMarker = compareMarkers(newMarker, currentProgress?.completionMarker || null) > 0 ? newMarker : currentProgress?.completionMarker;
    
    let verseCount = currentProgress?.totalCompletedVerses || 0;
    if (finalMarker) {
        const { count, error } = await countVersesUpTo(finalMarker);
        if (error) {
            alert(`완료된 구절 수를 계산하는 데 실패했습니다: ${error}`);
        } else {
            verseCount = count;
        }
    }

    const bookProgress: BookProgress = {
      ...currentProgress,
      lastSession: { ...finalState, isComplete: true },
      completionMarker: finalMarker,
      totalCompletedVerses: verseCount,
    };
    
    const debugInfo = await updateUserProgress(bookName, bookProgress);
    setProgressDebugInfo(debugInfo);

    if (debugInfo.error) {
        alert(`진행률 업데이트에 실패했습니다: ${debugInfo.error}`);
    } else {
        setProfile(p => (p ? ({...p, progress: {...(p.progress || {}), [bookName]: bookProgress }}) : null));
    }

    setAppStatus('idle');
    setLearningSession(null);

  }, [profile, setProfile]);

  const handleGptKeySaved = useCallback(() => {
    setProfile(p => p ? { ...p, chatgpt_api_key: 'saved' } : null);
  }, [setProfile]);
  
  const handlePerplexityKeySaved = useCallback(() => {
    setProfile(p => p ? { ...p, perplexity_api_key: 'saved' } : null);
  }, [setProfile]);
  
  const handleDeleteRequest = () => setIsDeleteModalOpen(true);
  const handleConfirmDelete = async () => {
      try {
          await deleteAccount();
      } catch (err) {
          alert(`계정 삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
          setIsDeleteModalOpen(false);
      }
  };

  const renderContent = () => {
    if (authStatus === 'loading') {
      return <LoadingScreen message="세션 정보를 불러오는 중..." />;
    }

    switch (appStatus) {
      case 'login':
        return <LoginScreen onLogin={login} onRegister={register} error={authError} />;
      case 'awaiting-confirmation':
        return <AwaitingConfirmationScreen onBackToLogin={() => setAppStatus('login')} />;
      case 'profile_error':
        return <ProfileErrorScreen error={authError || "알 수 없는 프로필 오류"} onLogout={logout} />;
      case 'idle':
        return (
          <WelcomeScreen
            onStart={handleStart}
            profile={profile}
            onLogout={logout}
            onDelete={handleDeleteRequest}
            onGptKeySaved={handleGptKeySaved}
            onPerplexityKeySaved={handlePerplexityKeySaved}
          />
        );
      case 'loading':
         return <LoadingScreen message={loadingMessage} />;
      case 'learning':
        if (!learningSession) {
          setAppStatus('idle');
          return null;
        }
        return (
          <LearningSession
            savedSession={learningSession}
            onStateChange={setLearningSession}
            onFinish={() => handleFinish(learningSession)}
            onBack={() => setAppStatus('idle')}
            onSaveAndExit={() => handleSaveAndExit(learningSession)}
            onSkip={() => setAppStatus('idle')}
            onSystemBack={() => {
              if (window.confirm("학습을 중단하고 메인 화면으로 돌아가시겠습니까? 변경사항은 저장되지 않습니다.")) {
                  setAppStatus('idle');
              }
            }}
          />
        );
      case 'finished':
        if (!lastResult) {
          setAppStatus('idle');
          return null;
        }
        return (
          <ResultsScreen
            lastResult={lastResult}
            onRestart={() => setAppStatus('idle')}
            progressDebugInfo={progressDebugInfo}
          />
        );
      default:
        return <LoginScreen onLogin={login} onRegister={register} error={authError} />;
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30">
      {renderContent()}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </main>
  );
}

export default App;