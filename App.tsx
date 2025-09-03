import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { AppStatus, LearningSessionState, AiModel, Profile } from './types';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, IconCheck, IconX, LearningStep } from './constants';
import LoginScreen from './components/LoginScreen';
import ConversationalLearning from './components/LearningSession';
import { getStudyTopicForBook as getGeminiStudyTopic, getNextStudyTopic as getNextGeminiStudyTopic } from './services/geminiService';
import { getStudyTopicForBook as getPerplexityStudyTopic, getNextStudyTopic as getNextPerplexityStudyTopic, testPerplexityApiKey } from './services/perplexityService';
import { getStudyTopicForBook as getChatGptStudyTopic, getNextStudyTopic as getNextChatGptStudyTopic, testChatGptApiKey } from './services/chatgptService';
import { loginUser, registerUser, getProfile, updateUserProgress, saveActiveSession, logoutUser, createProfile, deleteUserAccount } from './services/userDataService';
import { BIBLE_BOOK_DATA, calculateVersesFromTopics, getStudiedVersesForBooks, TOTAL_BIBLE_VERSES, TOTAL_OT_VERSES, TOTAL_NT_VERSES } from './services/bibleData';
import { supabase } from './services/supabaseClient';
import type { Session } from '@supabase/supabase-js';


type KeyStatus = 'untested' | 'testing' | 'valid' | 'invalid';

const AppHeader: React.FC<{ onLogout: () => void; onDelete: () => void; }> = ({ onLogout, onDelete }) => (
    <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10">
        <div className="text-lg font-bold text-slate-200">성경 공부 도우미</div>
        <div className="flex items-center gap-2">
            <button
                onClick={onDelete}
                className="px-4 py-2 text-red-400 font-semibold rounded-lg hover:bg-red-900/50 hover:text-red-300 transition-colors text-sm"
            >
                회원 탈퇴
            </button>
            <button
                onClick={onLogout}
                className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors text-sm"
            >
                로그아웃
            </button>
        </div>
    </header>
);

const WelcomeScreen: React.FC<{ 
    onStart: (book: string, aiModel: AiModel, apiKey?: string) => void;
    userProgress: Profile['progress'] | null;
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
        const studiedVerses = calculateVersesFromTopics(studiedTopics);
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
    
    const ProgressBar: React.FC<{ label: string, progress: number, studied: number, total: number }> = ({ label, progress, studied, total }) => (
        <div>
            <div className="flex justify-between items-center text-sm mb-1 text-slate-300">
                <span>{label}</span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
                <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
            <p className="text-right text-xs text-slate-400 mt-1">
                {studied.toLocaleString()} / {total.toLocaleString()}절
            </p>
        </div>
    );

    const totalStudied = getStudiedVersesForBooks(userProgress, [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS]);
    const otStudied = getStudiedVersesForBooks(userProgress, OLD_TESTAMENT_BOOKS);
    const ntStudied = getStudiedVersesForBooks(userProgress, NEW_TESTAMENT_BOOKS);

    const totalProgress = TOTAL_BIBLE_VERSES > 0 ? (totalStudied / TOTAL_BIBLE_VERSES) * 100 : 0;
    const otProgress = TOTAL_OT_VERSES > 0 ? (otStudied / TOTAL_OT_VERSES) * 100 : 0;
    const ntProgress = TOTAL_NT_VERSES > 0 ? (ntStudied / TOTAL_NT_VERSES) * 100 : 0;


    return (
        <div className="w-full max-w-4xl mx-auto bg-slate-800/50 p-4 sm:p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
            <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-2">성경 공부 도우미</h1>
                <p className="text-lg text-slate-300 mb-4">변호사의 방법</p>
                <p className="text-slate-400">공부하고 싶은 성경을 선택하고 학습을 시작하세요.</p>
            </div>
            
            <div className="mb-8 px-4 sm:px-0">
                <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">전체 학습 진도율</h3>
                <div className="bg-slate-900/50 p-4 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <ProgressBar 
                        label="성경 전체" 
                        progress={totalProgress}
                        studied={totalStudied}
                        total={TOTAL_BIBLE_VERSES}
                    />
                    <ProgressBar 
                        label="구약" 
                        progress={otProgress}
                        studied={otStudied}
                        total={TOTAL_OT_VERSES}
                    />
                    <ProgressBar 
                        label="신약" 
                        progress={ntProgress}
                        studied={ntStudied}
                        total={TOTAL_NT_VERSES}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                <div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">구약 (39권)</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-2">
                        {OLD_TESTAMENT_BOOKS.map(book => <BookButton key={book} book={book} />)}
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">신약 (27권)</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-2">
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
                                            const studied = calculateVersesFromTopics(userProgress[selectedBook]);
                                            return total > 0 ? `${Math.round((studied / total) * 100)}%` : '0%';
                                        })()}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2.5">
                                    <div 
                                        className="bg-blue-600 h-2.5 rounded-full" 
                                        style={{ width: `${(() => {
                                            const total = BIBLE_BOOK_DATA[selectedBook]?.totalVerses || 0;
                                            const studied = calculateVersesFromTopics(userProgress[selectedBook]);
                                            return total > 0 ? Math.round((studied / total) * 100) : 0;
                                        })()}%`}}
                                    ></div>
                                </div>
                                <p className="text-right text-xs text-slate-400 mt-1">
                                    {calculateVersesFromTopics(userProgress[selectedBook])} / {BIBLE_BOOK_DATA[selectedBook].totalVerses}절
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
    <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
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
        <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
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

const AwaitingConfirmationScreen: React.FC<{ onBackToLogin: () => void }> = ({ onBackToLogin }) => (
    <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 mb-4">가입 확인</h2>
        <p className="text-slate-300 text-lg mb-6">
            가입을 완료하려면 받은 편지함에서 확인 이메일을 확인하세요. 이메일을 받지 못했다면 스팸 폴더를 확인해 보세요.
        </p>
        <button
            onClick={onBackToLogin}
            className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
        >
            로그인 화면으로 돌아가기
        </button>
    </div>
);

const RLSInstructions: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const codeSnippet = `
-- 1. "profiles" 테이블에 RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. SELECT 정책: 사용자는 자신의 프로필을 조회할 수 있습니다.
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 3. INSERT 정책: 사용자는 자신의 프로필을 생성할 수 있습니다.
CREATE POLICY "Users can create their own profile."
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 4. UPDATE 정책: 사용자는 자신의 프로필을 수정할 수 있습니다.
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
    `.trim();

    return (
        <div className="text-left mt-6 border-t border-slate-700 pt-6">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-lg font-semibold text-slate-200 hover:text-white transition-colors">
                <span>솔루션: Supabase RLS 정책 설정하기</span>
                <span className="transform transition-transform">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
                <div className="mt-4 space-y-4 text-slate-300">
                    <p>
                        이 오류는 Supabase 데이터베이스의 'profiles' 테이블에 대한 RLS(행 수준 보안) 정책이 설정되지 않았을 때 주로 발생합니다.
                        아래 단계를 따라 정책을 설정해주세요.
                    </p>
                    <ol className="list-decimal list-inside space-y-2 pl-2">
                        <li>Supabase 프로젝트 대시보드로 이동하세요.</li>
                        <li>왼쪽 메뉴에서 'SQL Editor'를 선택하세요.</li>
                        <li>'+ New query'를 클릭하세요.</li>
                        <li>아래의 SQL 코드를 복사하여 붙여넣고 'RUN' 버튼을 클릭하세요.</li>
                    </ol>
                    <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                        <code>{codeSnippet}</code>
                    </pre>
                    <p>
                        정책을 적용한 후, 이 페이지를 새로고침하여 다시 시도해주세요.
                    </p>
                </div>
            )}
        </div>
    );
};


const ProfileErrorScreen: React.FC<{ error: string; onLogout: () => void; }> = ({ error, onLogout }) => {
    const isRLSError = error.includes('RLS') || error.includes('시간 초과');

    return (
        <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-red-400 mb-4">프로필 로딩 실패</h2>
            <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap">{error}</pre>
            <p className="text-slate-400 text-sm mb-6">
                {isRLSError
                    ? "아래 지침에 따라 문제를 해결한 후 페이지를 새로고침해주세요."
                    : "위의 문제를 해결한 후, 페이지를 새로고침하여 다시 시도해주세요. 또는 로그아웃할 수 있습니다."
                }
            </p>
            <button
                onClick={onLogout}
                className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
            >
                로그아웃
            </button>
            {isRLSError && <RLSInstructions />}
        </div>
    );
};


const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>('loading');
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [activeSession, setActiveSession] = useState<LearningSessionState | null>(null);
    const [lastScore, setLastScore] = useState<{ score: number, total: number, topic: string, aiModel: AiModel, apiKey?: string }>({ score: 0, total: 0, topic: '', aiModel: 'gemini', apiKey: undefined });
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string>('앱을 초기화하고 Supabase에 연결하는 중...');
    
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
                // Only switch to login if not in a pending confirmation state
                if (statusRef.current !== 'awaiting-confirmation' && statusRef.current !== 'profile_error') {
                    setStatus('login');
                }
                return;
            }
            
            // Avoid re-loading if we are intentionally showing a profile error.
            if (statusRef.current === 'profile_error') return;

            if (statusRef.current !== 'loading') {
                setStatus('loading');
            }

            setLoadingMessage('세션 확인됨. 프로필 조회 시도 중...');
            setAuthError(null);
            try {
                let userProfile = await getProfile(session.user);
                
                if (!userProfile) {
                    setLoadingMessage('기존 프로필 없음. 신규 프로필 생성 시도 중...');
                    userProfile = await createProfile(session.user.id, session.user.email);
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
                
                if (userProfile.active_learning_session) {
                    setLoadingMessage('진행 중인 학습 세션을 발견했습니다.');
                    setActiveSession(userProfile.active_learning_session);
                    setStatus('session-prompt');
                } else {
                    setLoadingMessage('준비 완료. 환영 화면으로 이동합니다.');
                    setActiveSession(null);
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
            // onAuthStateChange will handle the rest
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

    const handleDeleteUser = useCallback(async () => {
        if (!profile) return;
        if (window.confirm("정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 모든 학습 기록이 영구적으로 삭제됩니다.")) {
            setStatus('loading');
            setLoadingMessage('계정을 삭제하는 중입니다...');
            try {
                await deleteUserAccount();
                await handleLogout(); // Reuse logout logic to clear state
            } catch (e) {
                setError(e instanceof Error ? e.message : '계정 삭제에 실패했습니다.');
                setStatus('error');
            }
        }
    }, [profile, handleLogout]);
    
    const handleStartLearning = async (book: string, aiModel: AiModel, apiKey?: string) => {
        setStatus('loading');
        setLoadingMessage(`'${book}'에 대한 학습 주제를 찾는 중...`);
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
                currentStep: LearningStep.ANALYSIS,
                messages: [],
                aiModel: aiModel,
                apiKey: apiKey,
                bibleVerse: null,
                score: 0,
                quizData: null,
                currentQuestionIndex: 0
            };
            setActiveSession(newSession);
            // Do not save to DB yet, wait for the conversation to start
            setStatus('learning');
        } catch (e) {
            setError(e instanceof Error ? e.message : '학습 세션을 시작하는 데 실패했습니다.');
            setStatus('error');
        }
    };

    const handleFinishLearning = useCallback(async (score: number, total: number) => {
        if (!activeSession || !profile) return;

        try {
            // Only update progress if the test wasn't skipped
            if(score >= 0) {
                const newProgress = await updateUserProgress(
                    profile.id,
                    activeSession.topic.split(' ')[0],
                    activeSession.topic,
                    profile.progress
                );
                setProfile(prev => prev ? { ...prev, progress: newProgress } : null);
            }
        } catch (e) {
             setError(e instanceof Error ? e.message : '진행 상황을 업데이트하는 데 실패했습니다.');
             setStatus('error');
             return; // Stop execution if progress fails to save
        }
        
        setLastScore({ score, total, topic: activeSession.topic, aiModel: activeSession.aiModel, apiKey: activeSession.apiKey });
        setActiveSession(null);
        if (profile?.id) {
            await saveActiveSession(profile.id, null);
        }
        setStatus('finished');
    }, [activeSession, profile]);

    const handleContinueLearning = useCallback(async () => {
        setStatus('loading');
        setLoadingMessage(`'${lastScore.topic}' 이후의 학습 주제를 찾는 중...`);
        setError(null);
        try {
            const bookName = lastScore.topic.split(' ')[0];
            if (!bookName) throw new Error("책 이름을 찾을 수 없습니다.");
            
            let nextTopic: string;
            if (lastScore.aiModel === 'perplexity' && lastScore.apiKey) {
                nextTopic = await getNextPerplexityStudyTopic(lastScore.topic, lastScore.apiKey);
            } else if (lastScore.aiModel === 'chatgpt' && lastScore.apiKey) {
                nextTopic = await getNextChatGptStudyTopic(lastScore.topic, lastScore.apiKey);
            } else {
                nextTopic = await getNextGeminiStudyTopic(lastScore.topic);
            }
            
            const newSession: LearningSessionState = {
                topic: nextTopic,
                currentStep: LearningStep.ANALYSIS,
                messages: [],
                aiModel: lastScore.aiModel,
                apiKey: lastScore.apiKey,
                bibleVerse: null,
                score: 0,
                quizData: null,
                currentQuestionIndex: 0
            };
            setActiveSession(newSession);
            setStatus('learning');
        } catch (e) {
            setError(e instanceof Error ? e.message : '다음 학습 세션을 시작하는 데 실패했습니다.');
            setStatus('error');
        }
    }, [lastScore]);

    const handleStateChange = useCallback(async (newState: LearningSessionState) => {
        setActiveSession(newState);
        if (profile?.id) {
            await saveActiveSession(profile.id, newState);
        }
    }, [profile?.id]);

    const handleRestart = useCallback(() => {
        setStatus('idle');
        setActiveSession(null);
        setLastScore({ score: 0, total: 0, topic: '', aiModel: 'gemini', apiKey: undefined });
    }, []);
    
    const handleResume = useCallback(() => {
        setStatus('learning');
    }, []);
    
    const handleDiscard = useCallback(async () => {
        if (profile?.id) {
            await saveActiveSession(profile.id, null);
        }
        setActiveSession(null);
        setStatus('idle');
    }, [profile?.id]);

    const handleBackToMain = useCallback(() => {
        setError(null);
        setStatus('idle');
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
                        <AppHeader onLogout={handleLogout} onDelete={handleDeleteUser} />
                        <WelcomeScreen 
                            onStart={handleStartLearning} 
                            userProgress={profile?.progress ?? null} 
                        />
                    </div>
                );
            case 'session-prompt':
                if (!activeSession) { // Should not happen, but as a fallback
                    setStatus('idle');
                    return null;
                }
                return <ResumeSessionPrompt session={activeSession} onResume={handleResume} onDiscard={handleDiscard} />;
            case 'learning':
                if (!activeSession) { // Should not happen
                     setStatus('idle');
                     return null;
                }
                return <ConversationalLearning 
                    savedSession={activeSession} 
                    onStateChange={handleStateChange}
                    onFinish={handleFinishLearning}
                    onBack={handleBackToMain}
                />;
            case 'finished':
                return <ResultsScreen 
                    score={lastScore.score} 
                    total={lastScore.total} 
                    topic={lastScore.topic}
                    onRestart={handleRestart}
                    onContinue={handleContinueLearning}
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
                    </div>
                );
        }
    };

    return (
        <main className="w-full min-h-screen flex items-center justify-center p-4 font-sans antialiased">
            {renderContent()}
        </main>
    );
};

export default App;