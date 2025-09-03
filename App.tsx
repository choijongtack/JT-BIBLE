import React, { useState, useCallback, useEffect } from 'react';
import type { AppStatus, LearningSessionState, AiModel } from './types';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, IconCheck, IconX } from './constants';
import LoginScreen from './components/LoginScreen';
import ConversationalLearning from './components/LearningSession';
import { getStudyTopicForBook as getGeminiStudyTopic, getNextStudyTopic as getNextGeminiStudyTopic } from './services/geminiService';
import { getStudyTopicForBook as getPerplexityStudyTopic, getNextStudyTopic as getNextPerplexityStudyTopic, testPerplexityApiKey } from './services/perplexityService';
import { getStudyTopicForBook as getChatGptStudyTopic, getNextStudyTopic as getNextChatGptStudyTopic, testChatGptApiKey } from './services/chatgptService';
import { getUserData, updateUserProgress, type UserProgress, loginUser, registerUser, saveActiveSession, UserData } from './services/userDataService';
import { BIBLE_BOOK_DATA, calculateTotalStudiedVerses } from './services/bibleData';


type KeyStatus = 'untested' | 'testing' | 'valid' | 'invalid';

const AppHeader: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
    <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10">
        <div className="text-lg font-bold text-slate-200">성경 공부 도우미</div>
        <button
            onClick={onLogout}
            className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors text-sm"
        >
            로그아웃
        </button>
    </header>
);

const WelcomeScreen: React.FC<{ 
    onStart: (book: string, aiModel: AiModel, apiKey?: string) => void;
    userProgress: UserProgress | null;
}> = ({ onStart, userProgress }) => {
    const [selectedBook, setSelectedBook] = useState<string | null>(null);
    const [selectedAI, setSelectedAI] = useState<AiModel>('gemini');
    
    // Perplexity state
    const [perplexityApiKey, setPerplexityApiKey] = useState('');
    const [perplexityKeyStatus, setPerplexityKeyStatus] = useState<KeyStatus>('untested');

    // ChatGPT state
    const [chatGptApiKey, setChatGptApiKey] = useState('');
    const [chatGptKeyStatus, setChatGptKeyStatus] = useState<KeyStatus>('untested');


    const handleTestPerplexityKey = async () => {
        setPerplexityKeyStatus('testing');
        const isValid = await testPerplexityApiKey(perplexityApiKey);
        setPerplexityKeyStatus(isValid ? 'valid' : 'invalid');
    };

    const handleTestGptKey = async () => {
        setChatGptKeyStatus('testing');
        const isValid = await testChatGptApiKey(chatGptApiKey);
        setChatGptKeyStatus(isValid ? 'valid' : 'invalid');
    };

    const handleStart = () => {
        if (selectedBook) {
            if (selectedAI === 'perplexity') {
                if (perplexityKeyStatus === 'valid') {
                    onStart(selectedBook, selectedAI, perplexityApiKey);
                }
            } else if (selectedAI === 'chatgpt') {
                if (chatGptKeyStatus === 'valid') {
                    onStart(selectedBook, selectedAI, chatGptApiKey);
                }
            } else {
                onStart(selectedBook, selectedAI);
            }
        }
    };
    
    const isStartDisabled = !selectedBook || 
        (selectedAI === 'perplexity' && perplexityKeyStatus !== 'valid') ||
        (selectedAI === 'chatgpt' && chatGptKeyStatus !== 'valid');

    const BookButton: React.FC<{ book: string }> = ({ book }) => {
        const studiedTopics = userProgress?.[book] || [];
        const studiedVerses = calculateTotalStudiedVerses(studiedTopics);
        const totalVerses = BIBLE_BOOK_DATA[book]?.totalVerses || 0;
        const progressPercent = totalVerses > 0 ? Math.min(100, Math.round((studiedVerses / totalVerses) * 100)) : 0;
        const isSelected = selectedBook === book;

        return (
            <button
                onClick={() => setSelectedBook(book)}
                className={`relative w-full text-center px-2 py-2 rounded-md transition-colors text-sm overflow-hidden group ${
                    isSelected
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
            >
                <div 
                    className={`absolute top-0 left-0 h-full transition-all duration-300 ${isSelected ? 'bg-blue-700/50' : 'bg-slate-600/70'}`}
                    style={{ width: `${progressPercent}%` }}
                ></div>
                <span className="relative z-10">{book}</span>
            </button>
        );
    };

    const KeyStatusIcon: React.FC<{ status: KeyStatus }> = ({ status }) => {
        switch (status) {
            case 'testing':
                return <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>;
            case 'valid':
                return <IconCheck className="w-6 h-6 text-green-400" />;
            case 'invalid':
                return <IconX className="w-6 h-6 text-red-400" />;
            default:
                return null;
        }
    }


    return (
        <div className="w-full max-w-4xl mx-auto bg-slate-800/50 p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-slate-100 mb-2">성경 공부 도우미</h1>
                <p className="text-lg text-slate-300 mb-4">변호사의 방법</p>
                <p className="text-slate-400">공부하고 싶은 성경을 선택하고 학습을 시작하세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                <div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">구약 (39권)</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-2">
                        {OLD_TESTAMENT_BOOKS.map(book => <BookButton key={book} book={book} />)}
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">신약 (27권)</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-2">
                        {NEW_TESTAMENT_BOOKS.map(book => <BookButton key={book} book={book} />)}
                    </div>
                </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-700">
                 <div className="flex flex-col items-center justify-center gap-6">
                    <div>
                        <h4 className="text-lg font-semibold text-slate-200 mb-3 text-center">AI 모델 선택</h4>
                        <div className="flex justify-center gap-4 flex-wrap">
                            <button 
                                onClick={() => setSelectedAI('gemini')}
                                className={`px-5 py-2 rounded-lg font-semibold transition-all ${selectedAI === 'gemini' ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                            >
                                Gemini 2.5 Flash
                            </button>
                             <button 
                                onClick={() => setSelectedAI('perplexity')}
                                className={`px-5 py-2 rounded-lg font-semibold transition-all ${selectedAI === 'perplexity' ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                            >
                                Perplexity Sonar
                            </button>
                             <button 
                                onClick={() => setSelectedAI('chatgpt')}
                                className={`px-5 py-2 rounded-lg font-semibold transition-all ${selectedAI === 'chatgpt' ? 'bg-teal-600 text-white ring-2 ring-teal-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                            >
                                ChatGPT 4.o
                            </button>
                        </div>
                    </div>

                    {selectedAI === 'perplexity' && (
                        <div className="w-full max-w-md p-4 bg-slate-900/50 rounded-lg">
                            <label htmlFor="perplexity-key" className="block text-sm font-medium text-slate-300 mb-2">
                                Perplexity API 키
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="perplexity-key"
                                    type="password"
                                    value={perplexityApiKey}
                                    onChange={(e) => {
                                        setPerplexityApiKey(e.target.value);
                                        setPerplexityKeyStatus('untested');
                                    }}
                                    className="flex-grow px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                                    placeholder="pplx-..."
                                />
                                <button onClick={handleTestPerplexityKey} disabled={!perplexityApiKey || perplexityKeyStatus === 'testing'} className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-wait transition-colors">
                                    테스트
                                </button>
                                <div className="w-6 h-6 flex items-center justify-center">
                                    <KeyStatusIcon status={perplexityKeyStatus} />
                                </div>
                            </div>
                            {perplexityKeyStatus === 'invalid' && <p className="text-red-400 text-xs mt-2">API 키가 유효하지 않습니다. Perplexity AI 대시보드에서 확인해주세요.</p>}
                             {perplexityKeyStatus === 'valid' && <p className="text-green-400 text-xs mt-2">API 키가 성공적으로 확인되었습니다!</p>}
                        </div>
                    )}
                    
                    {selectedAI === 'chatgpt' && (
                        <div className="w-full max-w-md p-4 bg-slate-900/50 rounded-lg">
                            <label htmlFor="chatgpt-key" className="block text-sm font-medium text-slate-300 mb-2">
                                OpenAI API 키 (ChatGPT)
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="chatgpt-key"
                                    type="password"
                                    value={chatGptApiKey}
                                    onChange={(e) => {
                                        setChatGptApiKey(e.target.value);
                                        setChatGptKeyStatus('untested');
                                    }}
                                    className="flex-grow px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
                                    placeholder="sk-..."
                                />
                                <button onClick={handleTestGptKey} disabled={!chatGptApiKey || chatGptKeyStatus === 'testing'} className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-wait transition-colors">
                                    테스트
                                </button>
                                <div className="w-6 h-6 flex items-center justify-center">
                                    <KeyStatusIcon status={chatGptKeyStatus} />
                                </div>
                            </div>
                            {chatGptKeyStatus === 'invalid' && <p className="text-red-400 text-xs mt-2">API 키가 유효하지 않습니다. OpenAI 대시보드에서 확인해주세요.</p>}
                            {chatGptKeyStatus === 'valid' && <p className="text-green-400 text-xs mt-2">API 키가 성공적으로 확인되었습니다!</p>}
                        </div>
                    )}

                    <div className="text-center mb-4 space-y-2 w-full">
                        {selectedBook && userProgress && BIBLE_BOOK_DATA[selectedBook] && (
                            <div className="w-full max-w-sm mx-auto bg-slate-900/50 p-3 rounded-lg">
                                <div className="flex justify-between items-center text-sm mb-1 text-slate-300">
                                    <span>{selectedBook} 학습 진도율</span>
                                    <span>
                                        {(() => {
                                            const total = BIBLE_BOOK_DATA[selectedBook]?.totalVerses || 0;
                                            const studied = calculateTotalStudiedVerses(userProgress[selectedBook]);
                                            return total > 0 ? `${Math.round((studied / total) * 100)}%` : '0%';
                                        })()}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2.5">
                                    <div 
                                        className="bg-blue-600 h-2.5 rounded-full" 
                                        style={{ width: `${(() => {
                                            const total = BIBLE_BOOK_DATA[selectedBook]?.totalVerses || 0;
                                            const studied = calculateTotalStudiedVerses(userProgress[selectedBook]);
                                            return total > 0 ? Math.round((studied / total) * 100) : 0;
                                        })()}%`}}
                                    ></div>
                                </div>
                                <p className="text-right text-xs text-slate-400 mt-1">
                                    {calculateTotalStudiedVerses(userProgress[selectedBook])} / {BIBLE_BOOK_DATA[selectedBook].totalVerses}절
                                </p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleStart}
                        disabled={isStartDisabled}
                        className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105 disabled:bg-slate-600 disabled:cursor-not-allowed disabled:scale-100"
                    >
                        {selectedBook ? `${selectedBook} 학습 시작` : '학습 세션 시작하기'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ResumeSessionPrompt: React.FC<{
    session: LearningSessionState;
    onResume: () => void;
    onDiscard: () => void;
}> = ({ session, onResume, onDiscard }) => (
    <div className="text-center bg-slate-800/50 p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 mb-4">진행 중인 학습 발견</h2>
        <p className="text-slate-300 text-lg mb-6">
            <span className="font-bold text-blue-400">{session.topic}</span> 학습을 이어서 하시겠습니까?
        </p>
        <div className="flex flex-col gap-4">
            <button
                onClick={onResume}
                className="w-full px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105"
            >
                학습 이어하기
            </button>
            <button
                onClick={onDiscard}
                className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
            >
                취소하고 새로 시작하기
            </button>
        </div>
    </div>
);


const ResultsScreen: React.FC<{ 
    score: number; 
    total: number; 
    onRestart: () => void;
    onContinue: () => void;
    topic: string;
}> = ({ score, total, onRestart, onContinue, topic }) => {
    const bookName = topic.split(' ')[0] || '성경';
    const isSkipped = score < 0;

    return (
        <div className="text-center bg-slate-800/50 p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
            <h2 className="text-3xl font-bold text-slate-100 mb-4">
                {isSkipped ? '시험을 건너뛰었습니다' : '학습 완료!'}
            </h2>
            <p className="text-slate-300 text-lg mb-2">
                {isSkipped ? `현재 주제: ${topic}` : '시험 점수:'}
            </p>
            {!isSkipped && (
                 <p className="text-5xl font-bold text-blue-400 mb-8">{score} / {total}</p>
            )}
            <div className="flex flex-col gap-4 mt-8">
                 <button
                    onClick={onContinue}
                    className="w-full px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105"
                >
                    {bookName} 계속 공부하기
                </button>
                <button
                    onClick={onRestart}
                    className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
                >
                    다른 책 공부하기
                </button>
            </div>
        </div>
    );
};


const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>('login');
    const [currentUser, setCurrentUser] = useState<{ email: string; data: UserData } | null>(null);
    const [activeSession, setActiveSession] = useState<LearningSessionState | null>(null);
    const [lastScore, setLastScore] = useState<{ score: number, total: number }>({ score: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [justChoseStartNew, setJustChoseStartNew] = useState(false);
    
    useEffect(() => {
        if (currentUser?.data.activeLearningSession) {
            setActiveSession(currentUser.data.activeLearningSession);
            setStatus('session-prompt');
        } else if (currentUser) {
            setStatus('idle');
        }
    }, [currentUser]);

    const handleStartLearning = useCallback(async (book: string, aiModel: AiModel, apiKey?: string) => {
        if (activeSession) {
            const currentBookName = activeSession.topic.split(' ')[0];
            if (currentBookName === book) {
                // User selected the same book they were studying. Resume the session.
                if (justChoseStartNew) {
                    // If resuming after "start new", show only the last part of the conversation.
                    const truncatedMessages = activeSession.messages.slice(-2);
                    setActiveSession(prev => prev ? { ...prev, messages: truncatedMessages } : null);
                }
                setJustChoseStartNew(false); // Reset the flag
                setStatus('learning');
                return;
            } else {
                // User selected a different book. Confirm before starting a new session.
                if (!window.confirm(`'${currentBookName}'에 대한 학습 세션이 진행 중입니다. 이 세션을 종료하고 '${book}'에 대한 새로운 학습을 시작하시겠습니까?`)) {
                    return;
                }
            }
        }
        
        setJustChoseStartNew(false); // Always reset when starting a truly new session
        setStatus('loading');
        setError(null);
        try {
            let topic: string;
            
            if (aiModel === 'perplexity' && apiKey) {
                topic = await getPerplexityStudyTopic(book, apiKey);
            } else if (aiModel === 'chatgpt' && apiKey) {
                topic = await getChatGptStudyTopic(book, apiKey);
            } else {
                topic = await getGeminiStudyTopic(book);
            }
            
            const newSession: LearningSessionState = {
                topic,
                aiModel,
                apiKey,
                currentStep: '분석' as any,
                messages: [],
                bibleVerse: null,
                score: 0,
                quizData: null,
                currentQuestionIndex: 0
            };

            setActiveSession(newSession);
            if (currentUser) {
                saveActiveSession(currentUser.email, newSession);
            }
            setStatus('learning');

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : '주제를 가져오는 데 실패했습니다.');
            setStatus('error');
        }
    }, [activeSession, currentUser, justChoseStartNew]);
    
    const handleSessionStateChange = useCallback((newState: LearningSessionState) => {
        setActiveSession(newState);
        if (currentUser) {
            saveActiveSession(currentUser.email, newState);
        }
    }, [currentUser]);
    
    const handleFinishLearning = useCallback((score: number, total: number) => {
        if (currentUser && activeSession && score >= 0) { // score is -1 if skipped
            const bookName = activeSession.topic.split(' ')[0];
            updateUserProgress(currentUser.email, bookName, activeSession.topic);
            const updatedUserData = getUserData(currentUser.email);
            if (updatedUserData) {
                setCurrentUser(prev => prev ? { ...prev, data: updatedUserData } : null);
            }
        }
        setLastScore({ score, total });
        setActiveSession(null);
        if (currentUser) {
            saveActiveSession(currentUser.email, null);
        }
        setStatus('finished');
    }, [currentUser, activeSession]);

    const handleContinueLearning = useCallback(async () => {
        if (!activeSession) {
             // This case should ideally not happen if called from ResultsScreen,
             // but as a fallback, let's try to get the last topic from user progress.
             // For now, we show an error.
             setError('현재 학습 세션 정보가 없습니다.');
             setStatus('error');
             return;
        }

        setStatus('loading');
        setError(null);

        try {
            let nextTopic: string;
            const { aiModel, apiKey, topic } = activeSession;
            const bookName = topic.split(' ')[0];

            if (aiModel === 'perplexity' && apiKey) {
                nextTopic = await getNextPerplexityStudyTopic(topic, apiKey);
            } else if (aiModel === 'chatgpt' && apiKey) {
                nextTopic = await getNextChatGptStudyTopic(topic, apiKey);
            } else {
                nextTopic = await getNextGeminiStudyTopic(topic);
            }

            if (nextTopic === topic || !nextTopic.startsWith(bookName)) {
                setError(`'${bookName}'의 학습을 모두 마쳤습니다! 다른 성경을 선택해주세요.`);
                setStatus('error');
                return;
            }

            const newSession: LearningSessionState = {
                topic: nextTopic,
                aiModel,
                apiKey,
                currentStep: '분석' as any,
                messages: [],
                bibleVerse: null,
                score: 0,
                quizData: null,
                currentQuestionIndex: 0,
            };

            setActiveSession(newSession);
             if (currentUser) {
                saveActiveSession(currentUser.email, newSession);
            }
            setStatus('learning');

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : '다음 주제를 가져오는 데 실패했습니다.');
            setStatus('error');
        }
    }, [activeSession, currentUser]);

    const handleRestart = () => {
        setActiveSession(null);
        if (currentUser) {
            saveActiveSession(currentUser.email, null);
        }
        setStatus('idle');
        setError(null);
    };

    const handleReturnToSelection = () => {
        setStatus('idle');
    };
    
    const handleLogin = async (email: string, password: string) => {
        setAuthError(null);
        try {
            const userData = loginUser(email, password);
            setCurrentUser({ email, data: userData });
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : '로그인 실패');
        }
    };
    
    const handleRegister = async (email: string, password: string) => {
        setAuthError(null);
        try {
            const userData = registerUser(email, password);
            setCurrentUser({ email, data: userData });
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : '회원가입 실패');
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setActiveSession(null);
        setStatus('login');
    };

    const renderContent = () => {
        if (!currentUser) {
            return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} error={authError} />;
        }

        switch (status) {
            case 'session-prompt':
                return <ResumeSessionPrompt 
                    session={activeSession!}
                    onResume={() => {
                        setJustChoseStartNew(false);
                        setStatus('learning');
                    }}
                    onDiscard={() => {
                        // Don't clear the active session, just go to the selection screen.
                        // This allows the user to resume if they select the same book.
                        setJustChoseStartNew(true);
                        setStatus('idle');
                    }}
                />
            case 'idle':
                return <WelcomeScreen onStart={handleStartLearning} userProgress={currentUser.data.progress} />;
            case 'loading':
                return (
                    <div className="text-center text-slate-300">
                        <h2 className="text-3xl font-bold mb-4">다음 주제 준비 중...</h2>
                        <p>AI가 다음 학습에 가장 적합한 부분을 찾고 있습니다.</p>
                    </div>
                );
            case 'learning':
                if (!activeSession) return <div>세션 정보가 없습니다...</div>
                return <ConversationalLearning 
                    key={activeSession.topic} // force re-mount when topic changes
                    savedSession={activeSession}
                    onStateChange={handleSessionStateChange}
                    onFinish={handleFinishLearning} 
                    onBack={handleReturnToSelection}
                 />;
            case 'finished':
                return <ResultsScreen 
                    score={lastScore.score} 
                    total={lastScore.total} 
                    onRestart={handleRestart} 
                    onContinue={handleContinueLearning}
                    topic={activeSession?.topic || ''}
                />;
            case 'error':
                 return (
                    <div className="text-center bg-slate-800/50 p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
                        <h2 className="text-3xl font-bold text-red-400 mb-4">오류가 발생했습니다</h2>
                        <p className="text-slate-300 text-lg mb-8">{error}</p>
                        <button
                            onClick={handleRestart}
                            className="px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all transform hover:scale-105"
                        >
                            다시 시도하기
                        </button>
                    </div>
                 );
            default:
                return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} error={authError} />;
        }
    };

    return (
        <main className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-900 text-white font-sans relative">
            {currentUser && <AppHeader onLogout={handleLogout} />}
            <div className="w-full h-full flex items-center justify-center">
                 {renderContent()}
            </div>
        </main>
    );
};

export default App;