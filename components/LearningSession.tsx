import React, { useState, useEffect, useCallback, useRef } from 'react';
import { startLearningConversation as startGeminiConversation, continueLearningConversation as continueGeminiConversation, getSystemInstruction as getGeminiSystemInstruction } from '../services/geminiService';
import { startLearningConversation as startPerplexityConversation, continueLearningConversation as continuePerplexityConversation, getSystemInstruction as getPerplexitySystemInstruction } from '../services/perplexityService';
import { startLearningConversation as startChatGptConversation, continueLearningConversation as continueChatGptConversation, getSystemInstruction as getChatGptSystemInstruction } from '../services/chatgptService';
import { LearningStep } from '../constants';
import type { Quiz, ChatMessage, LearningSessionState, AiModel } from '../types';
import { QuestionType } from '../types';
import QuizCard from './QuizCard';
import type { Chat } from '@google/genai';


interface ConversationalLearningProps {
  savedSession: LearningSessionState;
  onStateChange: (newState: LearningSessionState) => void;
  onFinish: (score: number, total: number) => void;
  onBack: () => void;
}

const LoadingDots: React.FC = () => (
    <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
    </div>
);

const ProgressTracker: React.FC<{ currentStep: LearningStep }> = ({ currentStep }) => {
    const steps = Object.values(LearningStep);
    const currentIndex = steps.indexOf(currentStep);

    return (
        <div className="flex items-center justify-between mb-4 px-2">
            {steps.map((step, index) => (
                <React.Fragment key={step}>
                    <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${index <= currentIndex ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                            {index < currentIndex ? '✔' : index + 1}
                        </div>
                        <p className={`mt-2 text-[10px] sm:text-xs font-semibold ${index <= currentIndex ? 'text-blue-400' : 'text-slate-500'}`}>{step}</p>
                    </div>
                    {index < steps.length - 1 && <div className={`flex-1 h-1 mx-2 transition-colors duration-300 ${index < currentIndex ? 'bg-blue-600' : 'bg-slate-700'}`}></div>}
                </React.Fragment>
            ))}
        </div>
    );
};

const SystemPromptModal: React.FC<{ isOpen: boolean; onClose: () => void; prompt: string }> = ({ isOpen, onClose, prompt }) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 transition-opacity duration-300"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-700 transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-slate-700 flex-shrink-0">
                    <h2 className="text-lg font-bold text-slate-100">AI 시스템 지침</h2>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
                        aria-label="Close modal"
                    >
                        &times;
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {prompt}
                    </pre>
                </div>
                <div className="p-4 border-t border-slate-700 text-right flex-shrink-0">
                     <button 
                        onClick={onClose} 
                        className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 transition-colors"
                     >
                        닫기
                     </button>
                </div>
            </div>
            <style>{`
                @keyframes fade-in-scale {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in-scale {
                    animation: fade-in-scale 0.2s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

const BibleVersePanel: React.FC<{ topic: string, verse: string | null }> = ({ topic, verse }) => (
    <div className="w-full sm:w-1/3 flex-shrink-0 h-64 sm:h-auto bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-700 flex-shrink-0">
            <h2 className="text-xl font-bold text-slate-100">{topic} 본문</h2>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">
            {verse ? (
                <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{verse}</p>
            ) : (
                <p className="text-slate-400">성경 본문을 불러오는 중입니다...</p>
            )}
        </div>
    </div>
);


const ConversationalLearning: React.FC<ConversationalLearningProps> = ({ savedSession, onStateChange, onFinish, onBack }) => {
    const { topic, aiModel, apiKey } = savedSession;
    const [messages, setMessages] = useState<ChatMessage[]>(savedSession.messages);
    const [currentStep, setCurrentStep] = useState<LearningStep>(savedSession.currentStep);
    const [isLoading, setIsLoading] = useState(false);
    const [userInput, setUserInput] = useState('');
    const [chatSession, setChatSession] = useState<Chat | ChatMessage[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [bibleVerse, setBibleVerse] = useState<string | null>(savedSession.bibleVerse);
    const [isManualMode, setIsManualMode] = useState(false);

    const [quizData, setQuizData] = useState<Quiz | null>(savedSession.quizData);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(savedSession.currentQuestionIndex);
    const [score, setScore] = useState(savedSession.score);
    
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const isMounted = useRef(false);

    useEffect(() => {
        chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);
    
    useEffect(() => {
        if (!isMounted.current) return;
        
        onStateChange({
            ...savedSession,
            messages,
            currentStep,
            bibleVerse,
            quizData,
            currentQuestionIndex,
            score,
        });
    }, [messages, currentStep, bibleVerse, quizData, currentQuestionIndex, score]);

    const processAIResponse = useCallback((text: string): string => {
        let cleanedText = text;

        const stepMatch = text.match(/\[NEXT_STEP:(\w+)\]/);
        if (stepMatch && stepMatch[1]) {
            const nextStepKey = stepMatch[1] as keyof typeof LearningStep;
            const stepValue = Object.entries(LearningStep).find(([key, val]) => key === nextStepKey)?.[1];
            if (stepValue) {
                setCurrentStep(stepValue);
            }
            cleanedText = cleanedText.replace(stepMatch[0], '').trim();
        }

        const testMatch = text.match(/\[START_TEST\]/);
        if (testMatch) {
            cleanedText = cleanedText.replace(testMatch[0], '').trim();
            try {
                const quizJsonString = cleanedText.substring(cleanedText.indexOf('{'));
                const parsedQuiz = JSON.parse(quizJsonString) as Quiz;
                setQuizData(parsedQuiz);
                return cleanedText.substring(0, cleanedText.indexOf('{')).trim();
            } catch (e) {
                console.error("Failed to parse quiz JSON", e);
                setError("퀴즈 데이터를 처리하는 중 오류가 발생했습니다.");
                return "퀴즈를 시작하는 데 문제가 발생했습니다.";
            }
        }

        return cleanedText;
    }, []);

    useEffect(() => {
        const initConversation = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                let initialMessage: string | undefined;
                if (aiModel === 'perplexity' && apiKey) {
                    const { history, initialMessage: perplexityMessage } = await startPerplexityConversation(topic, apiKey, savedSession.messages);
                    setChatSession(history);
                    initialMessage = perplexityMessage;
                } else if (aiModel === 'chatgpt' && apiKey) {
                    const { history, initialMessage: gptMessage } = await startChatGptConversation(topic, apiKey, savedSession.messages);
                    setChatSession(history);
                    initialMessage = gptMessage;
                } else {
                    const { chat, initialMessage: geminiMessage } = await startGeminiConversation(topic, savedSession.messages);
                    setChatSession(chat);
                    initialMessage = geminiMessage;
                }
                
                if (initialMessage) {
                    const verseMatch = initialMessage.match(/\[BIBLE_VERSE\]([\s\S]*?)\[\/BIBLE_VERSE\]/);
                    let conversationStartMessage = initialMessage;
                    if (verseMatch && verseMatch[1]) {
                        setBibleVerse(verseMatch[1].trim());
                        conversationStartMessage = initialMessage.replace(verseMatch[0], '').trim();
                    }

                    const cleanedMessage = processAIResponse(conversationStartMessage);
                    if (cleanedMessage) {
                        setMessages([{ role: 'model', content: cleanedMessage }]);
                    }
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다');
            } finally {
                setIsLoading(false);
                isMounted.current = true;
            }
        };

        initConversation();
    }, [topic, aiModel, apiKey]); // This effect should only run when the session fundamentally changes.

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || !chatSession) return;

        const newUserMessage: ChatMessage = { role: 'user', content: userInput };
        const updatedMessages = [...messages, newUserMessage];
        setMessages(updatedMessages);
        
        const currentInput = userInput;
        setUserInput('');
        setIsLoading(true);
        setError(null);

        try {
            let responseText: string;
             if (aiModel === 'perplexity' && apiKey) {
                responseText = await continuePerplexityConversation(chatSession as ChatMessage[], currentInput, apiKey);
                const newModelMessage: ChatMessage = { role: 'model', content: responseText };
                setChatSession([...(chatSession as ChatMessage[]), newUserMessage, newModelMessage]);
            } else if (aiModel === 'chatgpt' && apiKey) {
                responseText = await continueChatGptConversation(chatSession as ChatMessage[], currentInput, apiKey);
                const newModelMessage: ChatMessage = { role: 'model', content: responseText };
                setChatSession([...(chatSession as ChatMessage[]), newUserMessage, newModelMessage]);
            } else {
                responseText = await continueGeminiConversation(chatSession as Chat, currentInput);
            }
            
            const cleanedText = processAIResponse(responseText);
            if (cleanedText) {
                setMessages(prev => [...prev, { role: 'model', content: cleanedText }]);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualNextStep = async () => {
        const steps = Object.values(LearningStep);
        const currentIndex = steps.indexOf(currentStep);
        const nextStep = steps[currentIndex + 1];

        if (!nextStep || isLoading || !chatSession) return;

        const forceMessage = `[사용자 액션] '${nextStep}' 단계로 강제 이동합니다. 이 단계에 맞는 질문을 시작해주세요.`;
        
        const newUserMessage: ChatMessage = { role: 'user', content: forceMessage };
        setMessages(prev => [...prev, newUserMessage]);
        
        setIsLoading(true);
        setError(null);
        
        try {
            let responseText: string;
            
            if (aiModel === 'perplexity' && apiKey) {
                responseText = await continuePerplexityConversation(chatSession as ChatMessage[], forceMessage, apiKey);
                const newModelMessage: ChatMessage = { role: 'model', content: responseText };
                setChatSession([...(chatSession as ChatMessage[]), newUserMessage, newModelMessage]);
            } else if (aiModel === 'chatgpt' && apiKey) {
                responseText = await continueChatGptConversation(chatSession as ChatMessage[], forceMessage, apiKey);
                const newModelMessage: ChatMessage = { role: 'model', content: responseText };
                setChatSession([...(chatSession as ChatMessage[]), newUserMessage, newModelMessage]);
            } else {
                responseText = await continueGeminiConversation(chatSession as Chat, forceMessage);
            }
            
            const cleanedText = processAIResponse(responseText);
            if (cleanedText) {
                setMessages(prev => [...prev, { role: 'model', content: cleanedText }]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleQuizSubmit = (answers: string[]): boolean => {
        const currentQuestion = quizData?.questions[currentQuestionIndex];
        if (!currentQuestion) return false;

        let isCorrect = false;
        if (currentQuestion.type === QuestionType.FILL_IN_THE_BLANK) {
            isCorrect = answers.every((ans, i) => ans.trim().toLowerCase() === currentQuestion.answers[i].trim().toLowerCase());
        } else {
            isCorrect = answers[0].trim().toLowerCase() === currentQuestion.answer.trim().toLowerCase();
        }

        if (isCorrect) {
            setScore(s => s + 1);
        }
        return isCorrect;
    };

    const handleNextQuestion = () => {
        if (currentQuestionIndex < (quizData?.questions.length || 0) - 1) {
            setCurrentQuestionIndex(i => i + 1);
        } else {
            onFinish(score, quizData?.questions.length || 0);
        }
    };
    
    const handleSkipQuiz = () => {
        onFinish(-1, quizData?.questions.length || 0); // Use a negative score to indicate a skip
    }
    
    const getSystemPrompt = () => {
        if(aiModel === 'perplexity') return getPerplexitySystemInstruction(topic);
        if(aiModel === 'chatgpt') return getChatGptSystemInstruction(topic);
        return getGeminiSystemInstruction(topic);
    }
    
    if (error) {
         return (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                <h2 className="text-2xl font-bold text-red-400 mb-4">대화 중 오류 발생</h2>
                <p className="text-slate-300 max-w-md mb-6">{error}</p>
                <button
                    onClick={onBack}
                    className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
                >
                    돌아가기
                </button>
            </div>
        );
    }

    return (
        quizData ? (
            <div className="w-full max-w-7xl mx-auto p-2 sm:p-6 flex items-center justify-center">
                <QuizCard
                    question={quizData.questions[currentQuestionIndex]}
                    questionNumber={currentQuestionIndex + 1}
                    totalQuestions={quizData.questions.length}
                    onSubmit={handleQuizSubmit}
                    onNext={handleNextQuestion}
                    onSkip={handleSkipQuiz}
                />
            </div>
        ) : (
            <div className="w-full h-[95vh] max-w-7xl mx-auto p-2 sm:p-6 flex flex-col sm:flex-row gap-6">
                <BibleVersePanel topic={topic} verse={bibleVerse} />

                <div className="flex-1 flex flex-col bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0 flex-wrap gap-2">
                        <h2 className="text-xl font-bold text-slate-100 truncate pr-4" title={topic}>{topic}</h2>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 p-1.5 bg-slate-900/50 rounded-lg border border-slate-600">
                                <span className={`text-xs font-medium transition-colors ${!isManualMode ? 'text-blue-400' : 'text-slate-500'}`}>자동</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={isManualMode} onChange={() => setIsManualMode(prev => !prev)} className="sr-only peer" />
                                    <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                                <span className={`text-xs font-medium transition-colors ${isManualMode ? 'text-blue-400' : 'text-slate-500'}`}>수정</span>
                            </div>
                            {isManualMode && currentStep !== LearningStep.TEST && (
                                <button
                                    onClick={handleManualNextStep}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                                >
                                    다음 단계로 &rarr;
                                </button>
                            )}
                            <button onClick={() => setIsPromptModalOpen(true)} className="px-3 py-1.5 text-xs text-slate-400 border border-slate-600 rounded-md hover:bg-slate-700 hover:text-white transition-colors">
                                지침 보기
                            </button>
                            <button onClick={onBack} className="px-3 py-1.5 text-xs bg-slate-600 text-white font-semibold rounded-md hover:bg-slate-500 transition-colors">
                                뒤로가기
                            </button>
                        </div>
                    </div>

                    <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-700">
                        <ProgressTracker currentStep={currentStep} />
                    </div>

                    <div ref={chatContainerRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xl px-5 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-slate-700 text-slate-200 rounded-bl-lg'}`}>
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="max-w-xl px-5 py-3 rounded-2xl bg-slate-700 text-slate-200 rounded-bl-lg">
                                    <LoadingDots />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 sm:p-6 border-t border-slate-700 flex-shrink-0">
                        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                            <input
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="메시지를 입력하세요..."
                                disabled={isLoading}
                                className="flex-1 w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !userInput.trim()}
                                className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                            >
                                전송
                            </button>
                        </form>
                    </div>
                </div>
                <SystemPromptModal isOpen={isPromptModalOpen} onClose={() => setIsPromptModalOpen(false)} prompt={getSystemPrompt()} />
            </div>
        )
    );
};

export default ConversationalLearning;