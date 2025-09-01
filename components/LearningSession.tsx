import React, { useState, useEffect, useCallback, useRef } from 'react';
import { startLearningConversation, continueLearningConversation, getSystemInstruction } from '../services/geminiService';
import { LearningStep } from '../constants';
import type { Quiz, ChatMessage, QuizQuestion } from '../types';
import { QuestionType } from '../types';
import QuizCard from './QuizCard';
import type { Chat } from '@google/genai';


interface ConversationalLearningProps {
  topic: string;
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
                        <p className={`mt-2 text-xs font-semibold ${index <= currentIndex ? 'text-blue-400' : 'text-slate-500'}`}>{step}</p>
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

const ConversationalLearning: React.FC<ConversationalLearningProps> = ({ topic, onFinish, onBack }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentStep, setCurrentStep] = useState<LearningStep>(LearningStep.ANALYSIS);
    const [isLoading, setIsLoading] = useState(true);
    const [userInput, setUserInput] = useState('');
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

    // Quiz state
    const [quizData, setQuizData] = useState<Quiz | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);

    const processAIResponse = useCallback((text: string): string => {
        let cleanedText = text;

        const stepMatch = text.match(/\[NEXT_STEP:(\w+)\]/);
        if (stepMatch && stepMatch[1]) {
            const nextStepKey = stepMatch[1] as keyof typeof LearningStep;
            if (LearningStep[nextStepKey]) {
                setCurrentStep(LearningStep[nextStepKey]);
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
            setMessages([]);
            try {
                const { chat, initialMessage } = await startLearningConversation(topic);
                setChatSession(chat);
                const cleanedMessage = processAIResponse(initialMessage);
                if (cleanedMessage) {
                    setMessages([{ role: 'model', content: cleanedMessage }]);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다');
            } finally {
                setIsLoading(false);
            }
        };
        initConversation();
    }, [topic, processAIResponse]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || !chatSession) return;

        const newUserMessage: ChatMessage = { role: 'user', content: userInput };
        setMessages(prev => [...prev, newUserMessage]);
        setUserInput('');
        setIsLoading(true);
        setError(null);

        try {
            const responseText = await continueLearningConversation(chatSession, userInput);
            const cleanedMessage = processAIResponse(responseText);

            if (cleanedMessage) {
                setMessages(prev => [...prev, { role: 'model', content: cleanedMessage }]);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다';
            setError(errorMessage);
            setMessages(prev => [...prev, { role: 'model', content: `오류가 발생했습니다: ${errorMessage}` }]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSubmitAnswer = (userAnswers: string[]): boolean => {
        if (!quizData) return false;
        const question = quizData.questions[currentQuestionIndex];
        
        let isCorrect = false;
        if (question.type === QuestionType.FILL_IN_THE_BLANK) {
            isCorrect = userAnswers.every((ans, i) => ans.trim().toLowerCase() === question.answers[i].trim().toLowerCase());
        } else if (question.type === QuestionType.QUESTION_ANSWER) {
            isCorrect = (userAnswers[0]?.trim().toLowerCase() || '') === question.answer.trim().toLowerCase();
        }

        if (isCorrect) setScore(s => s + 1);
        return isCorrect;
    };

    const handleNextQuestion = () => {
        if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
            setCurrentQuestionIndex(i => i + 1);
        } else {
            onFinish(score, quizData?.questions.length || 0);
        }
    };

    if (quizData) {
        const currentQuestion = quizData.questions[currentQuestionIndex];
        return (
            <div className="w-full max-w-4xl mx-auto">
                 <QuizCard
                    key={currentQuestionIndex}
                    question={currentQuestion}
                    questionNumber={currentQuestionIndex + 1}
                    totalQuestions={quizData.questions.length}
                    onSubmit={handleSubmitAnswer}
                    onNext={handleNextQuestion}
                />
            </div>
        );
    }
    
    return (
        <React.Fragment>
            <div className="w-full max-w-3xl h-[90vh] mx-auto flex flex-col bg-slate-800/50 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm p-4 sm:p-6">
                <div className="flex-shrink-0">
                    <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mb-4">&larr; 다른 주제 선택하기</button>
                    <h1 className="text-2xl font-bold text-slate-100 text-center mb-2">학습 주제: {topic}</h1>
                    <div className="text-center mb-3">
                         <button
                            onClick={() => setIsPromptModalOpen(true)}
                            className="text-xs text-slate-400 hover:text-blue-400 underline transition-colors"
                         >
                            AI 지침 보기
                        </button>
                    </div>
                    <ProgressTracker currentStep={currentStep} />
                    <hr className="border-slate-700 mb-4"/>
                </div>

                <div ref={chatContainerRef} className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-lg px-4 py-2.5 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-slate-700 text-slate-200 rounded-bl-lg'}`}>
                               <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="max-w-lg px-4 py-2.5 rounded-2xl bg-slate-700 rounded-bl-lg">
                               <LoadingDots />
                            </div>
                        </div>
                    )}
                     {error && (
                        <div className="p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">
                            <p className="font-bold mb-1">오류 발생</p>
                            <p>{error}</p>
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 mt-4 pt-4 border-t border-slate-700">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder={isLoading ? "AI가 응답하는 중..." : "답변을 입력하세요..."}
                            disabled={isLoading}
                            className="flex-1 w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-50"
                            aria-label="User input"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !userInput.trim()}
                            className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                            aria-label="Send message"
                        >
                            전송
                        </button>
                    </form>
                </div>
            </div>
            <SystemPromptModal 
                isOpen={isPromptModalOpen}
                onClose={() => setIsPromptModalOpen(false)}
                prompt={getSystemInstruction(topic)}
            />
        </React.Fragment>
    );
};

export default ConversationalLearning;