import React, { useState, useEffect, useCallback, useRef } from 'react';
import { startLearningConversation as startGeminiConversation, continueLearningConversation as continueGeminiConversation } from '../services/geminiService';
import { startLearningConversation as startPerplexityConversation, continueLearningConversation as continuePerplexityConversation } from '../services/perplexityService';
import { startLearningConversation as startChatGptConversation, continueLearningConversation as continueChatGptConversation } from '../services/chatgptService';
import { LearningStep } from '../constants';
import type { Quiz, ChatMessage, LearningSessionState, AiModel } from '../types';
import { QuestionType } from '../types';
import QuizCard from './QuizCard';
import { decrypt } from '../services/encryptionService';
import { supabase } from '../services/supabaseClient';

interface ConversationalLearningProps {
  savedSession: LearningSessionState;
  onStateChange: (newState: LearningSessionState) => void;
  onFinish: (score: number, total: number) => void;
  onBack: () => void;
  onSaveAndExit: () => void;
  onSkip: () => void;
  onSystemBack: () => void;
}

interface ProcessedResponse {
  cleanedText: string;
  stepChangedTo?: LearningStep;
  quizStarted?: Quiz;
  verseExtracted?: string;
  isComplete?: boolean;
}

const AI_MODEL_DISPLAY_NAMES: Record<AiModel, string> = {
  gemini: 'Gemini 2.5 Flash',
  perplexity: 'Perplexity Sonar',
  chatgpt: 'ChatGPT 4.0'
};


// ---------------- UI 보조 컴포넌트 ----------------
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

const BibleVerseModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  topic: string;
  verse: string | null;
}> = ({ isOpen, onClose, topic, verse }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="w-full max-w-lg max-h-[80vh] bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b border-slate-700 flex-shrink-0 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-100">{topic} 본문</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">
          {verse ? (
            <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{verse}</p>
          ) : (
            <p className="text-slate-400">성경 본문을 불러오는 중입니다...</p>
          )}
        </div>
      </div>
    </div>
  );
};


const BibleVersePanel: React.FC<{ topic: string, verse: string | null }> = ({ topic, verse }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <BibleVerseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        topic={topic}
        verse={verse}
      />
      <div className="w-full sm:w-1/3 flex-shrink-0 sm:h-auto bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">{topic} 본문</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!verse}
            className="sm:hidden px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:bg-slate-600"
          >
            본문 보기
          </button>
        </div>
        <div className="hidden sm:block p-4 sm:p-6 overflow-y-auto h-full">
          {verse ? (
            <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{verse}</p>
          ) : (
            <p className="text-slate-400">성경 본문을 불러오는 중입니다...</p>
          )}
        </div>
      </div>
    </>
  );
};


const StepControl: React.FC<{
  onStepSelect: (step: LearningStep) => void;
  currentStep: LearningStep;
  isLoading: boolean;
}> = ({ onStepSelect, currentStep, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const steps = Object.values(LearningStep);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (step: LearningStep) => {
    if (step !== currentStep) {
      onStepSelect(step);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>단계 이동</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
          <ul className="py-1" role="menu">
            {steps.map(step => (
              <li key={step}>
                <button
                  onClick={() => handleSelect(step)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    step === currentStep 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-700'
                  }`}
                  role="menuitem"
                >
                  {step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
       <style>{`
        @keyframes fade-in-fast {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-fast {
          animation: fade-in-fast 0.15s ease-out forwards;
        }
      `}</style>
    </div>
  );
};


// ---------------- 메인 컴포넌트 ----------------
const ConversationalLearning: React.FC<ConversationalLearningProps> = ({ savedSession, onStateChange, onFinish, onBack, onSaveAndExit, onSkip, onSystemBack }) => {
  const { topic, aiModel, apiKey: encryptedApiKey } = savedSession;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<LearningStep>(savedSession.currentStep);
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(savedSession.messages || []);
  const [error, setError] = useState<string | null>(null);
  const [bibleVerse, setBibleVerse] = useState<string | null>(savedSession.bibleVerse);
  const [decryptedApiKey, setDecryptedApiKey] = useState<string | undefined>(undefined);

  const [quizData, setQuizData] = useState<Quiz | null>(savedSession.quizData);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(savedSession.currentQuestionIndex);
  const [score, setScore] = useState(savedSession.score);
  const [isCompleted, setIsCompleted] = useState(savedSession.isComplete ?? false);
  
  // 모바일 UI 상태
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);
  
  // This effect handles the mobile back button press.
  useEffect(() => {
    // When the component mounts, push a new state to the history.
    window.history.pushState({ page: 'learning-session' }, '');

    const handleBackButton = (event: PopStateEvent) => {
      // When the user navigates back, the `popstate` event is triggered.
      // We then call onSystemBack to save the session and return to the main menu.
      onSystemBack();
    };

    window.addEventListener('popstate', handleBackButton);

    // Cleanup: remove the event listener when the component unmounts.
    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [onSystemBack]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
            setIsOptionsOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

 const processAIResponse = useCallback((text: string): ProcessedResponse => {
  let cleanedText = text;
  const result: ProcessedResponse = { cleanedText: '' };

  const verseMatch = cleanedText.match(/\[BIBLE_VERSE\]([\s\S]*?)\[\/BIBLE_VERSE\]/);
  if (verseMatch && verseMatch[1]) {
    const verse = verseMatch[1].trim();
    if (verse) result.verseExtracted = verse;
    cleanedText = cleanedText.replace(verseMatch[0], '').trim();
  }

  const stepMatch = cleanedText.match(/\[NEXT_STEP:(\w+)\]/);
  if (stepMatch && stepMatch[1]) {
    const nextStepKey = stepMatch[1].toUpperCase() as keyof typeof LearningStep;
    const stepValue = LearningStep[nextStepKey];
    if (stepValue) result.stepChangedTo = stepValue;
    cleanedText = cleanedText.replace(stepMatch[0], '').trim();
  }

  const testMatch = cleanedText.match(/\[START_TEST\]/);
  if (testMatch) {
    cleanedText = cleanedText.replace(testMatch[0], '').trim();
    try {
      const jsonStartIndex = cleanedText.search(/[{\[]/);
      if (jsonStartIndex !== -1) {
        const quizJsonString = cleanedText.substring(jsonStartIndex);
        const parsedQuiz = JSON.parse(quizJsonString) as Quiz;

        if (parsedQuiz && parsedQuiz.questions) {
          parsedQuiz.questions.forEach(q => {
            if (q.type === QuestionType.FILL_IN_THE_BLANK) {
              const question = q as import('../types').FillInTheBlankQuestion;

              // --- 🔥 verseTextParts 보정 로직 ---
              if (question.verseTextParts.length === 1) {
                const fullVerse = question.verseTextParts[0];
                const parts = fullVerse
                  .split(/(___|__)/g)
                  .map(p => (p === '__' || p === '___' ? '___' : p))
                  .filter(p => p && p.length > 0);
                question.verseTextParts = parts;
              }

              const existingBlanks = question.verseTextParts.filter(p => p === '___').length;
              if (existingBlanks !== question.answers.length) {
                const fullVerse = question.verseTextParts.join('');
                const parts = fullVerse
                  .split(/(___|__)/g)
                  .map(p => (p === '__' || p === '___' ? '___' : p))
                  .filter(p => p && p.length > 0);

                const newBlankCount = parts.filter(p => p === '___').length;
                if (newBlankCount === question.answers.length) {
                  question.verseTextParts = parts;
                } else {
                  console.warn("❗ FILL_IN_THE_BLANK 보정 실패", {
                    original: question.verseTextParts,
                    reconstructed: parts,
                    answers: question.answers,
                  });

                  // answers 개수만큼 강제로 blanks 삽입
                  question.verseTextParts = [fullVerse, ...Array(question.answers.length).fill('___')];
                }
              }
            }
          });
        }

        result.quizStarted = parsedQuiz;
        cleanedText = cleanedText.substring(0, jsonStartIndex).trim();
      }
    } catch {
      setError("퀴즈 데이터를 처리하는 중 오류가 발생했습니다.");
    }
  }

  const completeMatch = cleanedText.match(/\[COMPLETE\]/);
  if (completeMatch) {
    result.isComplete = true;
    cleanedText = cleanedText.replace(completeMatch[0], '').trim();
  }

  result.cleanedText = cleanedText;
  return result;
}, []); 

  const sendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading) return;
  
    const newUserMessage: ChatMessage = { role: 'user', content: messageContent };
    
    // Optimistically update the UI with the user's message.
    setMessages(prev => [...prev, newUserMessage]);
  
    setIsLoading(true);
    setError(null);
  
    // The history for the API should include the new user message.
    const historyForApi = [...chatHistory, newUserMessage];
  
    try {
      let responseText: string;
      if (aiModel === 'perplexity' && decryptedApiKey) {
        responseText = await continuePerplexityConversation(historyForApi.slice(0, -1), messageContent, decryptedApiKey);
      } else if (aiModel === 'chatgpt') {
        responseText = await continueChatGptConversation(historyForApi.slice(0, -1), messageContent);
      } else {
        responseText = await continueGeminiConversation(historyForApi.slice(0, -1), messageContent);
      }
  
      const newModelMessage: ChatMessage = { role: 'model', content: responseText };
      const processed = processAIResponse(responseText);
  
      if (processed.stepChangedTo) {
        setCurrentStep(processed.stepChangedTo);
        // On step change, reset history and UI for a clean start into the new phase.
        setChatHistory([newUserMessage, newModelMessage]);
        setMessages([newUserMessage, { role: 'model', content: processed.cleanedText }]);
      } else {
        // Otherwise, append the new model message to the existing history.
        setChatHistory(prev => [...prev, newUserMessage, newModelMessage]);
        setMessages(prev => [...prev, { role: 'model', content: processed.cleanedText }]);
      }
  
      if (processed.verseExtracted) setBibleVerse(processed.verseExtracted);
      if (processed.quizStarted) setQuizData(processed.quizStarted);
      if (processed.isComplete) setIsCompleted(true);
  
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      // On error, roll back the optimistic UI update.
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, chatHistory, aiModel, decryptedApiKey, processAIResponse]);
  
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(userInput);
    setUserInput('');
  };

  const handleForceStepChange = (step: LearningStep) => {
    const message = `[사용자 액션] '${step}' 단계로 강제 이동합니다.`;
    sendMessage(message);
  };
  
  const handleAdvanceStepRequest = () => {
    const message = "준비되었습니다. 다음 단계로 넘어가 주세요.";
    sendMessage(message);
  };

  useEffect(() => {
    const initializeConversation = async () => {
      if (chatHistory && chatHistory.length > 0) {
        const cleanedMessages = chatHistory.map(msg => {
            if (msg.role === 'model') {
                return { ...msg, content: processAIResponse(msg.content).cleanedText };
            }
            return msg;
        });
        setMessages(cleanedMessages);
        isMounted.current = true;
        return;
      }

      setIsLoading(true);
      setError(null);
      let plainApiKey: string | undefined = encryptedApiKey;

      try {
        if (plainApiKey && aiModel === 'perplexity') {
            const session = await supabase.auth.getSession();
            if (!session.data.session?.access_token) {
                throw new Error("API 키를 복호화하기 위한 인증 토큰을 찾을 수 없습니다.");
            }
            plainApiKey = await decrypt(plainApiKey, session.data.session.access_token);
            setDecryptedApiKey(plainApiKey);
        }

        let initialResponse: { history: ChatMessage[]; initialMessage?: string };

        if (aiModel === 'perplexity' && plainApiKey) {
            initialResponse = await startPerplexityConversation(topic, plainApiKey);
        } else if (aiModel === 'chatgpt') {
            initialResponse = await startChatGptConversation(topic);
        } else {
            initialResponse = await startGeminiConversation(topic);
        }

        const processed = processAIResponse(initialResponse.initialMessage || '');
        
        setChatHistory(initialResponse.history);
        
        if (processed.cleanedText) {
            setMessages([{ role: 'model', content: processed.cleanedText }]);
        }

        if (processed.verseExtracted) {
            setBibleVerse(processed.verseExtracted);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : '대화를 시작하는 중 알 수 없는 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
        setTimeout(() => { isMounted.current = true; }, 500);
      }
    };

    initializeConversation();
  }, []); 
  
  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isMounted.current) return;

    const newState: LearningSessionState = {
      topic: topic,
      aiModel: aiModel,
      apiKey: encryptedApiKey,
      messages: chatHistory,
      currentStep,
      bibleVerse,
      quizData,
      currentQuestionIndex,
      score,
      isComplete: isCompleted,
    };

    onStateChange(newState);
  }, [chatHistory, currentStep, bibleVerse, quizData, currentQuestionIndex, score, isCompleted, onStateChange, topic, aiModel, encryptedApiKey]);
  
  const handleQuizSubmit = (userAnswers: string[]): boolean => {
    const currentQuestion = quizData?.questions[currentQuestionIndex];
    if (!currentQuestion) return false;

    let isCorrect = false;
    if (currentQuestion.type === QuestionType.FILL_IN_THE_BLANK) {
        // To be correct, number of answers must match and not be zero.
        if (userAnswers.length !== currentQuestion.answers.length || currentQuestion.answers.length === 0) {
            return false;
        }
        isCorrect = userAnswers.every((ans, i) => 
            ans.trim().toLowerCase() === currentQuestion.answers[i].trim().toLowerCase()
        );
    } else if (currentQuestion.type === QuestionType.QUESTION_ANSWER) {
        // To be correct, there must be one answer.
        if (userAnswers.length !== 1) {
            return false;
        }
        isCorrect = userAnswers[0].trim().toLowerCase() === currentQuestion.answer.trim().toLowerCase();
    }

    if (isCorrect) {
        setScore(prev => prev + 1);
    }
    return isCorrect;
  };

  const handleQuizNext = () => {
    if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      const finalScore = score;
      const totalQuestions = quizData?.questions.length || 0;
      const systemMessage = `[SYSTEM] Test finished. Score: ${finalScore}/${totalQuestions}. Please provide the final completion message.`;
      
      setQuizData(null); // Return to chat view
      sendMessage(systemMessage);
    }
  };

  const handleQuizSkip = () => {
    onSkip();
  };

  const StepSelectionModal: React.FC = () => {
    if (!isStepModalOpen) return null;
    const steps = Object.values(LearningStep);

    return (
      <div 
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={() => setIsStepModalOpen(false)}
        aria-modal="true"
        role="dialog"
      >
        <div 
          className="w-full max-w-xs bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-lg font-bold text-slate-100 text-center">단계 이동</h3>
          </div>
          <ul className="py-2">
            {steps.map(step => (
              <li key={step}>
                <button
                  onClick={() => {
                    handleForceStepChange(step);
                    setIsStepModalOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    step === currentStep 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };


  // ---------------- Render ----------------
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
    <>
    <StepSelectionModal />
    {quizData ? (
      <div className="w-full max-w-7xl mx-auto p-2 sm:p-6 flex items-center justify-center">
        <QuizCard
          question={quizData.questions[currentQuestionIndex]}
          questionNumber={currentQuestionIndex + 1}
          totalQuestions={quizData.questions.length}
          onSubmit={handleQuizSubmit}
          onNext={handleQuizNext}
          onSkip={handleQuizSkip}
        />
      </div>
    ) : (
      <div className="w-full h-[95vh] max-w-7xl mx-auto p-2 sm:p-6 flex flex-col sm:flex-row gap-6">
        <BibleVersePanel topic={topic} verse={bibleVerse} />
        <div className="flex-1 flex flex-col bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0 gap-4">
            <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-slate-100 truncate" title={topic}>{topic}</h2>
                <p className="text-xs text-blue-400 mt-1">
                    AI 모델: {AI_MODEL_DISPLAY_NAMES[aiModel]}
                </p>
            </div>
            
            {/* --- Desktop Buttons --- */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <StepControl onStepSelect={handleForceStepChange} currentStep={currentStep} isLoading={isLoading} />
                <button
                  onClick={handleAdvanceStepRequest}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:bg-slate-600 transition-colors"
                >
                    다음 단계로
                </button>
                <button
                    onClick={onSaveAndExit}
                    className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                    저장 후 종료
                </button>
            </div>

            {/* --- Mobile Options Menu --- */}
            <div className="relative sm:hidden flex-shrink-0" ref={optionsMenuRef}>
              <button
                onClick={() => setIsOptionsOpen(prev => !prev)}
                className="p-2 rounded-full hover:bg-slate-700 transition-colors"
                aria-label="옵션"
                aria-haspopup="true"
                aria-expanded={isOptionsOpen}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                </svg>
              </button>

              {isOptionsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
                  <ul className="py-1" role="menu">
                    <li role="none">
                      <button
                        onClick={() => { setIsOptionsOpen(false); setIsStepModalOpen(true); }}
                        disabled={isLoading}
                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500"
                        role="menuitem"
                      >
                        단계 이동
                      </button>
                    </li>
                    <li role="none">
                        <button
                            onClick={() => { handleAdvanceStepRequest(); setIsOptionsOpen(false); }}
                            disabled={isLoading}
                            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500"
                            role="menuitem"
                        >
                            다음 단계로
                        </button>
                    </li>
                    <li role="none">
                        <button
                            onClick={() => { onSaveAndExit(); setIsOptionsOpen(false); }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                            role="menuitem"
                        >
                            저장 후 종료
                        </button>
                    </li>
                  </ul>
                </div>
              )}
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

          {isCompleted ? (
            <div className="p-4 sm:p-6 border-t border-slate-700 flex-shrink-0">
                <button
                    onClick={() => onFinish(score, quizData?.questions.length || 5)}
                    className="w-full px-5 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-500 transition-colors text-lg"
                >
                    학습 완료
                </button>
            </div>
          ) : (
            <div className="p-4 sm:p-6 border-t border-slate-700 flex-shrink-0">
                <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
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
          )}
        </div>
      </div>
    )}
    </>
  );
};

export default ConversationalLearning;