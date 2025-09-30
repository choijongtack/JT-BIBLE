import React, { useState, useEffect, useRef } from 'react';
import type { AiModel, Profile, AppStatus } from '../types';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, IconCheck, IconX, IconLoader } from '../constants';
import { savePerplexityApiKey } from '../services/perplexityService';
import { saveChatGptApiKey } from '../services/chatgptService';
import { calculateVerseProgressForList } from '../services/bibleData';

type ApiKeyStatus = 'unsaved' | 'saving' | 'saved' | 'error' | 'editing';

interface WelcomeScreenProps {
    status: AppStatus;
    loadingMessage: string;
    onStart: (book: string, aiModel: AiModel, mode?: 'general' | 'advanced') => void;
    profile: Profile | null;
    onLogout: () => void;
    onDelete: () => void;
    onGptKeySaved: () => void;
    onPerplexityKeySaved: () => void;
}

const IconQuestionMark: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
);

const StatProgressBar: React.FC<{
    label: string;
    studied: number;
    total: number;
    unit: string;
}> = ({ label, studied, total, unit }) => {
    const percentage = total > 0 ? (studied / total) * 100 : 0;
    const displayPercentage = Math.min(100, percentage).toFixed(1);

    return (
        <div className="flex flex-col items-center">
            <div className="w-full flex justify-between items-baseline mb-1">
                <span className="text-slate-300 font-semibold">{label}</span>
                <span className="text-slate-400 text-sm">
                    {studied.toLocaleString()} / {total.toLocaleString()} {total > 0 && `(${displayPercentage}%)`}
                </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
                <div 
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${displayPercentage}%` }}
                    aria-label={`${label} progress ${displayPercentage}%`}
                ></div>
            </div>
        </div>
    );
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ status, loadingMessage, onStart, profile, onLogout, onDelete, onGptKeySaved, onPerplexityKeySaved }) => {
    const isLoading = status === 'loading';
    const [selectedBook, setSelectedBook] = useState<string | null>(null);
    const [selectedAI, setSelectedAI] = useState<AiModel>('gemini');
    
    // Perplexity state
    const [perplexityApiKey, setPerplexityApiKey] = useState('');
    const [perplexityKeyStatus, setPerplexityKeyStatus] = useState<ApiKeyStatus>('unsaved');
    const [perplexityKeyError, setPerplexityKeyError] = useState<string | null>(null);

    // ChatGPT state
    const [chatGptApiKey, setChatGptApiKey] = useState('');
    const [chatGptKeyStatus, setChatGptKeyStatus] = useState<ApiKeyStatus>('unsaved');
    const [chatGptKeyError, setChatGptKeyError] = useState<string | null>(null);

    // State for info tooltips
    const [showGeneralInfo, setShowGeneralInfo] = useState(false);
    const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
    const generalInfoRef = useRef<HTMLDivElement>(null);
    const advancedInfoRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (profile?.chatgpt_api_key) {
            setChatGptKeyStatus('saved');
        } else {
            setChatGptKeyStatus('unsaved');
            setChatGptApiKey('');
        }
        if (profile?.perplexity_api_key) {
            setPerplexityKeyStatus('saved');
        } else {
            setPerplexityKeyStatus('unsaved');
            setPerplexityApiKey('');
        }
    }, [profile]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (generalInfoRef.current && !generalInfoRef.current.contains(event.target as Node)) {
                setShowGeneralInfo(false);
            }
            if (advancedInfoRef.current && !advancedInfoRef.current.contains(event.target as Node)) {
                setShowAdvancedInfo(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSavePerplexityKey = async () => {
        setPerplexityKeyStatus('saving');
        setPerplexityKeyError(null);
        try {
            await savePerplexityApiKey(perplexityApiKey.trim());
            setPerplexityKeyStatus('saved');
            onPerplexityKeySaved();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
            setPerplexityKeyStatus('error');
            setPerplexityKeyError(errorMessage);
        }
    };
    
    const handleSaveGptKey = async () => {
        setChatGptKeyStatus('saving');
        setChatGptKeyError(null);
        try {
            await saveChatGptApiKey(chatGptApiKey.trim());
            setChatGptKeyStatus('saved');
            onGptKeySaved();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
            setChatGptKeyStatus('error');
            setChatGptKeyError(errorMessage);
        }
    };

    const handleStart = (mode: 'general' | 'advanced') => {
        if (!selectedBook) return;
        onStart(selectedBook, selectedAI, mode);
    };
    
    const savedSessionForSelectedBook = profile?.progress?.[selectedBook || '']?.lastSession;
    const isInProgress = savedSessionForSelectedBook && !savedSessionForSelectedBook.isComplete;
    const inProgressMode = isInProgress ? savedSessionForSelectedBook.mode : null;

    const isStartDisabled = !selectedBook || 
        (selectedAI === 'perplexity' && perplexityKeyStatus !== 'saved') ||
        (selectedAI === 'chatgpt' && chatGptKeyStatus !== 'saved');

    const isGeneralStartDisabled = isStartDisabled || (isInProgress && inProgressMode !== 'general');
    const isAdvancedStartDisabled = isStartDisabled || (isInProgress && inProgressMode !== 'advanced');

    const getApiErrorMessage = (error: string | null, onSwitchToGemini: () => void, modelName: string) => {
        if (!error) return null;

        let specificHelp = '';
        const lowerError = error.toLowerCase();

        if (modelName === 'Perplexity') {
            if (lowerError.includes('invalid') || lowerError.includes('token')) {
                specificHelp = 'API 키가 잘못되었습니다. Perplexity AI 대시보드에서 키를 다시 복사하여 붙여넣어 보세요.';
            }
        } else if (modelName === 'ChatGPT') {
            if (lowerError.includes('quota')) {
                specificHelp = 'OpenAI 계정의 무료 크레딧을 모두 소진했거나 사용량 한도에 도달했습니다.';
            } else if (lowerError.includes('incorrect api key') || lowerError.includes('invalid authentication')) {
                specificHelp = 'API 키가 잘못되었습니다. 다시 확인해주세요.';
            }
        }

        return (
            <div className="text-red-400 text-xs mt-2 space-y-2">
                <p>API 키 저장에 실패했습니다.</p>
                <p className="font-mono bg-red-900/50 p-2 rounded text-red-300">상세 오류: {error}</p>
                {specificHelp && (
                    <div className="p-3 bg-slate-700/50 rounded text-slate-300">
                        <p className="font-bold mb-1">💡 해결 방법</p>
                        <p>{specificHelp}</p>
                    </div>
                )}
                <div className="p-3 bg-blue-900/50 rounded text-slate-300 border border-blue-700">
                    <p className="font-bold mb-1">💡 다른 방법</p>
                    <p>문제가 해결되지 않으면 Gemini 모델로 전환하세요.</p>
                    <button
                        type="button"
                        onClick={onSwitchToGemini}
                        className="w-full text-center mt-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500"
                    >
                        Gemini 모델로 전환
                    </button>
                </div>
            </div>
        );
    };

    const BookButton: React.FC<{ book: string }> = ({ book }) => {
        const isSelected = selectedBook === book;
        const bookProgress = profile?.progress?.[book];
        const isInProgress = bookProgress?.lastSession && !bookProgress.lastSession.isComplete;
        const hasCompletedTopics = bookProgress && bookProgress.completionMarker;

        return (
            <button
                onClick={() => setSelectedBook(book)}
                className={`relative w-full text-center px-2 py-2 rounded-md transition-colors text-sm group ${
                    isSelected
                        ? 'bg-blue-600 text-white font-bold'
                        : isInProgress
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 ring-1 ring-yellow-500/50'
                        : hasCompletedTopics 
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 ring-1 ring-blue-500/50'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
            >
                {isInProgress && (
                    <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" title="In Progress" />
                )}
                {!isInProgress && hasCompletedTopics && (
                    <IconCheck className="absolute top-1 right-1 w-3.5 h-3.5 text-blue-400" title="Has completed topics" />
                )}
                <span className="relative z-10">{book}</span>
            </button>
        );
    };

    const totalProgress = calculateVerseProgressForList(profile?.progress, [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS]);
    const otProgress = calculateVerseProgressForList(profile?.progress, OLD_TESTAMENT_BOOKS);
    const ntProgress = calculateVerseProgressForList(profile?.progress, NEW_TESTAMENT_BOOKS);

    const bookLastTopic = profile?.progress?.[selectedBook || '']?.lastSession?.topic;

    return (
        <div className="relative w-full max-w-4xl mx-auto bg-slate-800/50 p-4 sm:p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
             {/* --- Loading Overlay --- */}
            {isLoading && (
                <div className="absolute inset-0 bg-slate-800/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 rounded-2xl animate-fade-in">
                    <IconLoader className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                    <p className="text-slate-300 text-lg text-center px-4">{loadingMessage}</p>
                </div>
            )}

            <header className="flex flex-col items-center sm:flex-row sm:justify-between mb-8">
                <div className="hidden sm:block sm:flex-1" />
                <div className="text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-100">성경 공부 도우미</h1>
                    <p className="text-lg text-slate-300 mt-1">4단계 학습 방법</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-4 sm:mt-0 sm:flex-1 sm:justify-end">
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
            
            <p className="text-slate-400 text-center mb-8">공부할 성경을 선택하고 학습 모드를 정하세요.</p>
            
            {/* 진행률 표시 */}
            <div className="mb-8 px-4 sm:px-0">
                <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">전체 학습 진행률 (완료한 구절 기준)</h3>
                <div className="bg-slate-900/50 p-4 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <StatProgressBar 
                        label="성경 전체" 
                        studied={totalProgress.completed}
                        total={totalProgress.total}
                        unit="절"
                    />
                    <StatProgressBar 
                        label="구약" 
                        studied={otProgress.completed}
                        total={otProgress.total}
                        unit="절"
                    />
                    <StatProgressBar 
                        label="신약" 
                        studied={ntProgress.completed}
                        total={ntProgress.total}
                        unit="절"
                    />
                </div>
            </div>

            {/* 성경 선택 */}
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
            
            {/* AI 모델 선택 */}
            <div className="mt-8 pt-6 border-t border-slate-700">
                <div className="flex flex-col items-center justify-center gap-6">
                    {/* AI 모델 선택 버튼 */}
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
                                ChatGPT 4.0
                            </button>
                        </div>
                    </div>
                    
                    {/* API Key Input Sections */}
                    <div className="mt-2 w-full max-w-lg mx-auto">
                        {selectedAI === 'perplexity' && (
                            <div className="p-4 bg-slate-900/50 rounded-lg border border-purple-800/50 animate-fade-in">
                                <h5 className="text-md font-semibold text-purple-300 mb-3 text-center">Perplexity API 키 관리</h5>
                                {perplexityKeyStatus === 'saved' ? (
                                    <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                                        <div className="flex items-center gap-2 text-green-400">
                                            <IconCheck className="w-5 h-5" />
                                            <span>API 키가 안전하게 저장되었습니다.</span>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setPerplexityKeyStatus('editing');
                                                setPerplexityApiKey('');
                                                setPerplexityKeyError(null);
                                            }}
                                            className="px-4 py-1 text-sm text-slate-300 bg-slate-600 rounded-md hover:bg-slate-500"
                                        >
                                            수정
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="password"
                                                value={perplexityApiKey}
                                                onChange={(e) => setPerplexityApiKey(e.target.value)}
                                                placeholder="pplx-..."
                                                className="flex-1 w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                                            />
                                            <button
                                                onClick={handleSavePerplexityKey}
                                                disabled={!perplexityApiKey || perplexityKeyStatus === 'saving'}
                                                className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {perplexityKeyStatus === 'saving' ? '저장 중...' : '키 저장'}
                                            </button>
                                        </div>
                                        {perplexityKeyError && getApiErrorMessage(perplexityKeyError, () => setSelectedAI('gemini'), 'Perplexity')}
                                    </>
                                )}
                            </div>
                        )}
                        {selectedAI === 'chatgpt' && (
                            <div className="p-4 bg-slate-900/50 rounded-lg border border-teal-800/50 animate-fade-in">
                                <h5 className="text-md font-semibold text-teal-300 mb-3 text-center">ChatGPT API 키 관리</h5>
                                {chatGptKeyStatus === 'saved' ? (
                                    <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                                        <div className="flex items-center gap-2 text-green-400">
                                            <IconCheck className="w-5 h-5" />
                                            <span>API 키가 안전하게 저장되었습니다.</span>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setChatGptKeyStatus('editing');
                                                setChatGptApiKey('');
                                                setChatGptKeyError(null);
                                            }}
                                            className="px-4 py-1 text-sm text-slate-300 bg-slate-600 rounded-md hover:bg-slate-500"
                                        >
                                            수정
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="password"
                                                value={chatGptApiKey}
                                                onChange={(e) => setChatGptApiKey(e.target.value)}
                                                placeholder="sk-..."
                                                className="flex-1 w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
                                            />
                                            <button
                                                onClick={handleSaveGptKey}
                                                disabled={!chatGptApiKey || chatGptKeyStatus === 'saving'}
                                                className="px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {chatGptKeyStatus === 'saving' ? '저장 중...' : '키 저장'}
                                            </button>
                                        </div>
                                        {chatGptKeyError && getApiErrorMessage(chatGptKeyError, () => setSelectedAI('gemini'), 'ChatGPT')}
                                    </>
                                )}
                            </div>
                        )}
                    </div>


                    {/* 최근 학습 표시 */}
                    <div className="text-center mb-4 space-y-2 w-full h-16">
                        {selectedBook && (
                            <div className="w-full max-w-sm mx-auto bg-slate-900/50 p-3 rounded-lg">
                                <p className="text-sm text-slate-300 font-semibold mb-1">{selectedBook}</p>
                                {bookLastTopic ? (
                                    <p className="text-slate-400 text-sm">최근 학습: {bookLastTopic}</p>
                                ) : (
                                    <p className="text-slate-400 text-sm">아직 학습 기록이 없습니다.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 🚀 학습 시작 버튼 (일반/심화 모드) */}
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <div className="relative flex-1 group" ref={generalInfoRef}>
                            <button
                                onClick={() => handleStart('general')}
                                disabled={isGeneralStartDisabled}
                                className="w-full flex items-center justify-center px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all disabled:bg-slate-600 disabled:cursor-not-allowed"
                            >
                                <span>{selectedBook ? `${selectedBook} 일반 학습` : '일반 학습'}</span>
                                <span 
                                    onClick={(e) => { e.stopPropagation(); setShowGeneralInfo(s => !s); setShowAdvancedInfo(false); }}
                                    className="ml-2 p-1 rounded-full hover:bg-blue-500"
                                    aria-label="일반 학습 설명"
                                >
                                    <IconQuestionMark className="w-5 h-5" />
                                </span>
                            </button>
                            {isGeneralStartDisabled && selectedBook && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max p-2 bg-slate-900 text-xs text-slate-300 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    {isInProgress ? '진행 중인 심화 학습을 완료해야 선택 가능합니다.' : '먼저 성경과 AI 모델을 선택해주세요.'}
                                </div>
                            )}
                            {showGeneralInfo && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-slate-900 rounded-lg shadow-2xl border border-slate-700 z-20 animate-fade-in text-left">
                                    <h3 className="text-lg font-bold text-blue-400 mb-2">일반 학습</h3>
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                        성경 본문을 관찰, 해석, 적용하고 암기하는 4단계 학습법으로, 성경을 처음 접하거나 가볍게 공부하고 싶은 분들에게 적합합니다.
                                    </p>
                                    <button onClick={() => setShowGeneralInfo(false)} className="absolute top-2 right-2 p-1 text-slate-500 hover:text-white">
                                        <IconX className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative flex-1 group" ref={advancedInfoRef}>
                            <button
                                onClick={() => handleStart('advanced')}
                                disabled={isAdvancedStartDisabled}
                                className="w-full flex items-center justify-center px-8 py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg hover:bg-purple-500 transition-all disabled:bg-slate-600 disabled:cursor-not-allowed"
                            >
                                <span>{selectedBook ? `${selectedBook} 심화 학습` : '심화 학습'}</span>
                                <span 
                                    onClick={(e) => { e.stopPropagation(); setShowAdvancedInfo(s => !s); setShowGeneralInfo(false); }}
                                    className="ml-2 p-1 rounded-full hover:bg-purple-500"
                                    aria-label="심화 학습 설명"
                                >
                                    <IconQuestionMark className="w-5 h-5" />
                                </span>
                            </button>
                             {isAdvancedStartDisabled && selectedBook && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max p-2 bg-slate-900 text-xs text-slate-300 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                     {isInProgress ? '진행 중인 일반 학습을 완료해야 선택 가능합니다.' : '먼저 성경과 AI 모델을 선택해주세요.'}
                                </div>
                            )}
                            {showAdvancedInfo && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-slate-900 rounded-lg shadow-2xl border border-slate-700 z-20 animate-fade-in text-left">
                                    <h3 className="text-lg font-bold text-purple-400 mb-2">심화 학습</h3>
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                        성경 본문을 법률 조문처럼 분석, 이해하고 암기한 후, 논술형 시험으로 마무리하는 심화 학습법입니다. 더 깊이 있는 연구나 시험을 준비하는 분들에게 적합합니다.
                                    </p>
                                    <button onClick={() => setShowAdvancedInfo(false)} className="absolute top-2 right-2 p-1 text-slate-500 hover:text-white">
                                        <IconX className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
            <style>{`
                @keyframes fade-in {
                  from { opacity: 0; transform: translateY(-10px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                  animation: fade-in 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default WelcomeScreen;