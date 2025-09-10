import React, { useState, useEffect } from 'react';
import type { AiModel, Profile } from '../types';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, IconCheck, IconX } from '../constants';
import { testPerplexityApiKey } from '../services/perplexityService';
import { saveChatGptApiKey } from '../services/chatgptService';
import { calculateVerseProgressForList } from '../services/bibleData';

type KeyStatus = 'untested' | 'testing' | 'valid' | 'invalid';
type GptKeyStatus = 'unsaved' | 'saving' | 'saved' | 'error' | 'editing';

interface WelcomeScreenProps {
    onStart: (book: string, aiModel: AiModel, apiKey?: string) => void;
    profile: Profile | null;
    onLogout: () => void;
    onDelete: () => void;
    onTestUpdate: () => void;
    onGptKeySaved: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, profile, onLogout, onDelete, onTestUpdate, onGptKeySaved }) => {
    const [selectedBook, setSelectedBook] = useState<string | null>(null);
    const [selectedAI, setSelectedAI] = useState<AiModel>('gemini');
    
    // Perplexity state
    const [perplexityApiKey, setPerplexityApiKey] = useState('');
    const [perplexityKeyStatus, setPerplexityKeyStatus] = useState<KeyStatus>('untested');
    const [perplexityKeyError, setPerplexityKeyError] = useState<string | null>(null);

    // ChatGPT state
    const [chatGptApiKey, setChatGptApiKey] = useState('');
    const [chatGptKeyStatus, setChatGptKeyStatus] = useState<GptKeyStatus>('unsaved');
    const [chatGptKeyError, setChatGptKeyError] = useState<string | null>(null);

    useEffect(() => {
        if (profile?.chatgpt_api_key) {
            setChatGptKeyStatus('saved');
            setChatGptApiKey('••••••••••••••••');
        } else {
            setChatGptKeyStatus('unsaved');
            setChatGptApiKey('');
        }
    }, [profile]);


    const handleTestPerplexityKey = async () => {
        setPerplexityKeyStatus('testing');
        setPerplexityKeyError(null);
        const { isValid, error } = await testPerplexityApiKey(perplexityApiKey);
        setPerplexityKeyStatus(isValid ? 'valid' : 'invalid');
        if (!isValid) {
            setPerplexityKeyError(error || '알 수 없는 오류가 발생했습니다.');
        }
    };
    
    const handleSaveGptKey = async () => {
        setChatGptKeyStatus('saving');
        setChatGptKeyError(null);
        try {
            // FIX: Trim whitespace from the API key before saving to prevent validation issues.
            await saveChatGptApiKey(chatGptApiKey.trim());
            setChatGptKeyStatus('saved');
            onGptKeySaved();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
            setChatGptKeyStatus('error');
            setChatGptKeyError(errorMessage);
        }
    };


    const handleStart = () => {
        if (selectedBook) {
            if (selectedAI === 'perplexity') {
                if (perplexityKeyStatus === 'valid') {
                    onStart(selectedBook, selectedAI, perplexityApiKey);
                }
            } else if (selectedAI === 'chatgpt') {
                if (chatGptKeyStatus === 'saved') {
                    onStart(selectedBook, selectedAI);
                }
            } else {
                onStart(selectedBook, selectedAI);
            }
        }
    };
    
    const isStartDisabled = !selectedBook || 
        (selectedAI === 'perplexity' && perplexityKeyStatus !== 'valid') ||
        (selectedAI === 'chatgpt' && chatGptKeyStatus !== 'saved');

    const getPerplexityErrorMessage = (error: string | null, onSwitchToGemini: () => void) => {
        if (!error) return null;

        let specificHelp = '';
        const lowerError = error.toLowerCase();

        if (lowerError.includes('invalid api key') || lowerError.includes('invalid token')) {
            specificHelp = 'API 키가 잘못되었습니다. Perplexity AI 대시보드에서 키를 다시 복사하여 붙여넣어 보세요. 키에 공백이 포함되지 않았는지 확인해주세요.';
        } else if (lowerError.includes('not found')) {
            specificHelp = 'API 요청에 문제가 발생했습니다. 모델 이름이 올바른지 확인해주세요. (이것은 앱의 내부 문제일 수 있습니다.)';
        } else if (lowerError.includes('rate limit')) {
            specificHelp = '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요. 문제가 지속되면 Perplexity 요금제를 확인해주세요.';
        }

        return (
            <div className="text-red-400 text-xs mt-2 space-y-2">
                <p>API 키 테스트에 실패했습니다. 아래 상세 오류 및 해결 방법을 확인해주세요.</p>
                <p className="font-mono bg-red-900/50 p-2 rounded text-red-300">상세 오류: {error}</p>
                {specificHelp && (
                    <div className="p-3 bg-slate-700/50 rounded text-slate-300">
                        <p className="font-bold mb-1">💡 해결 방법</p>
                        <p>{specificHelp}</p>
                    </div>
                )}
                <div className="p-3 bg-blue-900/50 rounded text-slate-300 border border-blue-700">
                    <p className="font-bold mb-1">💡 다른 방법</p>
                    <p className="mb-2">문제가 해결되지 않으면, 별도의 API 키가 필요 없는 Gemini 모델로 전환하여 학습을 계속할 수 있습니다.</p>
                    <button
                        type="button"
                        onClick={onSwitchToGemini}
                        className="w-full text-center px-4 py-2 rounded-md transition-colors text-sm font-bold bg-blue-600 text-white hover:bg-blue-500"
                    >
                        Gemini 모델로 전환
                    </button>
                </div>
            </div>
        );
    };
    
    const getGptErrorMessage = (error: string | null, onSwitchToGemini: () => void) => {
        if (!error) return null;

        let specificHelp = '';
        const lowerError = error.toLowerCase();

        if (lowerError.includes('quota')) {
            specificHelp = '이 오류는 보통 OpenAI 계정의 무료 크레딧을 모두 소진했거나, 설정된 사용량 한도에 도달했을 때 발생합니다. OpenAI 대시보드의 "Usage" 및 "Billing" 섹션에서 결제 정보를 추가하거나 사용량 한도를 조정해야 합니다.';
        } else if (lowerError.includes('incorrect api key') || lowerError.includes('invalid authentication')) {
            specificHelp = 'API 키가 잘못되었습니다. OpenAI 대시보드에서 키를 다시 복사하여 붙여넣어 보세요. 키에 공백이 포함되지 않았는지 확인해주세요.';
        } else if (lowerError.includes('model_not_found')) {
             specificHelp = '지정된 모델을 찾을 수 없습니다. API 키가 해당 모델(gpt-4o)에 접근할 권한이 있는지 확인해주세요. GPT-4o 모델에 접근하려면 계정에 결제 정보가 등록되어 있어야 할 수 있습니다.';
        }

        return (
            <div className="text-red-400 text-xs mt-2 space-y-2">
                <p>API 키 저장에 실패했습니다. 아래 상세 오류 및 해결 방법을 확인해주세요.</p>
                <p className="font-mono bg-red-900/50 p-2 rounded text-red-300">상세 오류: {error}</p>
                {specificHelp && (
                    <div className="p-3 bg-slate-700/50 rounded text-slate-300">
                        <p className="font-bold mb-1">💡 해결 방법</p>
                        <p>{specificHelp}</p>
                    </div>
                )}
                <div className="p-3 bg-blue-900/50 rounded text-slate-300 border border-blue-700">
                    <p className="font-bold mb-1">💡 다른 방법</p>
                    <p className="mb-2">문제가 해결되지 않으면, 별도의 API 키가 필요 없는 Gemini 모델로 전환하여 학습을 계속할 수 있습니다.</p>
                    <button
                        type="button"
                        onClick={onSwitchToGemini}
                        className="w-full text-center px-4 py-2 rounded-md transition-colors text-sm font-bold bg-blue-600 text-white hover:bg-blue-500"
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

        // State 1: A session was saved but not completed.
        const isInProgress = bookProgress?.lastSession && !bookProgress.lastSession.isComplete;
        
        // State 2: At least one topic has been fully completed.
        const hasCompletedTopics = bookProgress && bookProgress.completedTopics.length > 0;

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
                {/* Show in-progress indicator with higher priority */}
                {isInProgress && (
                    <div 
                        className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"
                        title="학습 진행 중"
                    ></div>
                )}

                {/* Show completed indicator only if not in progress */}
                {!isInProgress && hasCompletedTopics && (
                    <IconCheck className="absolute top-1 right-1 w-3.5 h-3.5 text-blue-400" title="완료한 학습 있음" />
                )}
                
                <span className="relative z-10">{book}</span>
            </button>
        );
    };

    const PerplexityKeyStatusIcon: React.FC<{ status: KeyStatus }> = ({ status }) => {
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
    
     const GptKeyStatusDisplay: React.FC<{ status: GptKeyStatus }> = ({ status }) => {
        switch (status) {
            case 'saving':
                return <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>;
            case 'saved':
                return <IconCheck className="w-6 h-6 text-green-400" />;
            case 'error':
                return <IconX className="w-6 h-6 text-red-400" />;
            default:
                return null;
        }
    };
    
    const StatProgressBar: React.FC<{ label: string, studied: number, total: number, unit: string }> = ({ label, studied, total, unit }) => {
        const progress = total > 0 ? (studied / total) * 100 : 0;
        return (
            <div>
                <div className="flex justify-between items-center text-sm mb-1 text-slate-300">
                    <span>{label}</span>
                    <span>{progress.toFixed(2)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
                <p className="text-right text-xs text-slate-400 mt-1">
                    {studied.toLocaleString()} / {total.toLocaleString()}{unit}
                </p>
            </div>
        );
    };

    const totalProgress = calculateVerseProgressForList(profile?.progress, [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS]);
    const otProgress = calculateVerseProgressForList(profile?.progress, OLD_TESTAMENT_BOOKS);
    const ntProgress = calculateVerseProgressForList(profile?.progress, NEW_TESTAMENT_BOOKS);

    const bookLastTopic = profile?.progress?.[selectedBook || '']?.lastSession?.topic;

    return (
        <div className="w-full max-w-4xl mx-auto bg-slate-800/50 p-4 sm:p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
            <header className="flex flex-col items-center sm:flex-row sm:justify-between mb-8">
                <div className="hidden sm:block sm:flex-1">
                    {/* Spacer */}
                </div>
                <div className="text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-100">성경 공부 도우미</h1>
                    <p className="text-lg text-slate-300 mt-1">변호사의 방법</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-4 sm:mt-0 sm:flex-1 sm:justify-end">
                    <button
                        onClick={onTestUpdate}
                        className="px-4 py-2 text-yellow-400 font-semibold rounded-lg hover:bg-yellow-900/50 hover:text-yellow-300 transition-colors text-sm"
                    >
                        업데이트 테스트
                    </button>
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
            
            <p className="text-slate-400 text-center mb-8">공부하고 싶은 성경을 선택하고 학습을 시작하세요.</p>
            
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
                                        setPerplexityKeyError(null);
                                    }}
                                    className="flex-grow px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                                    placeholder="pplx-..."
                                />
                                <button onClick={handleTestPerplexityKey} disabled={!perplexityApiKey || perplexityKeyStatus === 'testing'} className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-wait transition-colors">
                                    테스트
                                </button>
                                <div className="w-6 h-6 flex items-center justify-center">
                                    <PerplexityKeyStatusIcon status={perplexityKeyStatus} />
                                </div>
                            </div>
                            {perplexityKeyStatus === 'invalid' && getPerplexityErrorMessage(perplexityKeyError, () => setSelectedAI('gemini'))}
                            {perplexityKeyStatus === 'valid' && <p className="text-green-400 text-xs mt-2">API 키가 성공적으로 확인되었습니다!</p>}
                        </div>
                    )}
                    
                    {selectedAI === 'chatgpt' && (
                        <div className="w-full max-w-md p-4 bg-slate-900/50 rounded-lg">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                OpenAI API 키 (ChatGPT)
                            </label>
                            {chatGptKeyStatus === 'saved' ? (
                                <div className="p-4 bg-slate-700/50 rounded-md">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <IconCheck className="w-6 h-6 text-green-400 shrink-0" />
                                            <p className="text-slate-200">저장된 API 키로 진행합니다.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setChatGptKeyStatus('editing');
                                                setChatGptApiKey('');
                                            }}
                                            className="px-4 py-1.5 text-sm bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
                                        >
                                            수정
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="chatgpt-key"
                                            type="password"
                                            value={chatGptApiKey}
                                            onChange={(e) => setChatGptApiKey(e.target.value)}
                                            readOnly={chatGptKeyStatus === 'saving'}
                                            className="flex-grow px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-none transition disabled:bg-slate-800"
                                            placeholder="sk-..."
                                        />
                                        <button 
                                            onClick={handleSaveGptKey} 
                                            disabled={!chatGptApiKey || chatGptKeyStatus === 'saving'} 
                                            className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-wait transition-colors"
                                        >
                                            키 저장
                                        </button>
                                        <div className="w-6 h-6 flex items-center justify-center">
                                            <GptKeyStatusDisplay status={chatGptKeyStatus} />
                                        </div>
                                    </div>
                                    {chatGptKeyStatus === 'error' && getGptErrorMessage(chatGptKeyError, () => setSelectedAI('gemini'))}
                                </>
                            )}
                        </div>
                    )}

                    <div className="text-center mb-4 space-y-2 w-full h-16">
                         {selectedBook && (
                            <div className="w-full max-w-sm mx-auto bg-slate-900/50 p-3 rounded-lg animate-fade-in">
                                <p className="text-sm text-slate-300 font-semibold mb-1">{selectedBook}</p>
                                {bookLastTopic && typeof bookLastTopic === 'string' ? (
                                    <div>
                                        <span className="text-xs text-slate-400">최근 학습: </span>
                                        <span className="font-mono text-blue-300 text-sm">{bookLastTopic.split(' ')[1] || ''}</span>
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-sm">아직 학습 기록이 없습니다.</p>
                                )}
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
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
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