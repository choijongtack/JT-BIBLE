import React, { useState, useEffect, useCallback, useRef } from 'react';
import { continueLearningConversation as continueGeminiConversation } from '../services/geminiService';
import { continueLearningConversation as continuePerplexityConversation } from '../services/perplexityService';
import { continueLearningConversation as continueChatGptConversation } from '../services/chatgptService';
import { LearningStep } from '../constants';
import type { Quiz, ChatMessage, LearningSessionState, AiModel, FillInTheBlankQuestion } from '../types';
import { QuestionType } from '../types';
import QuizCard from './QuizCard';
import { decrypt } from '../services/encryptionService';
import { supabase } from '../services/supabaseClient';
import { getBibleVerse } from '../services/bibleService';
import { parseReference } from '../services/bibleUtils';

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

const ProgressTracker: React.FC<{ currentStep: LearningStep, mode: 'general' | 'advanced' }> = ({ currentStep, mode }) => {
  const allSteps = Object.values(LearningStep);
  const steps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);
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
  source: 'DB' | 'AI' | null;
  fetchError: string | null;
}> = ({ isOpen, onClose, topic, verse, source, fetchError }) => {
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
            <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-bold text-slate-100">{topic} 본문</h2>
                {source && (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${source === 'DB' ? 'bg-green-600 text-green-100' : 'bg-yellow-600 text-yellow-100'}`}>
                        {source}
                    </span>
                )}
            </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">
            {fetchError && (
                <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-yellow-300">
                    <p className="font-bold mb-1">DB 불러오기 실패 (AI 대체)</p>
                    <p>{fetchError}</p>
                </div>
            )}
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


const BibleVersePanel: React.FC<{ topic: string, verse: string | null, source: 'DB' | 'AI' | null, fetchError: string | null }> = ({ topic, verse, source, fetchError }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <BibleVerseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        topic={topic}
        verse={verse}
        source={source}
        fetchError={fetchError}
      />
      <div className="w-full sm:w-1/3 flex-shrink-0 sm:h-auto bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
            <div className="flex items-baseline gap-3">
                <h2 className="text-lg sm:text-xl font-bold text-slate-100">{topic} 본문</h2>
                {source && (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${source === 'DB' ? 'bg-green-600 text-green-100' : 'bg-yellow-600 text-yellow-100'}`}>
                        {source}
                    </span>
                )}
            </div>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!verse}
            className="sm:hidden px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:bg-slate-600"
          >
            본문 보기
          </button>
        </div>
        <div className="hidden sm:block p-4 sm:p-6 overflow-y-auto h-full">
            {fetchError && (
                <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-yellow-300">
                    <p className="font-bold mb-1">DB 불러오기 실패</p>
                    <p>{fetchError}</p>
                </div>
            )}
            {verse ? (
                <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{verse}</p>
            ) : (
                 !fetchError && <p className="text-slate-400">성경 본문을 불러오는 중입니다...</p>
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
  mode: 'general' | 'advanced';
}> = ({ onStepSelect, currentStep, isLoading, mode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const allSteps = Object.values(LearningStep);
  const steps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);

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

// ---------------- Helper Functions ----------------

/**
 * AI가 유효한 퀴즈를 생성하지 못했을 때 DB 기반의 대체 퀴즈를 생성합니다.
 * @param topic 현재 학습 주제 (예: "창세기 1:1-5")
 * @param bibleVerse DB에서 가져온 원본 성경 본문
 * @returns 생성된 Quiz 객체 또는 실패 시 null
 */
const createFallbackQuiz = (topic: string, bibleVerse: string | null): Quiz | null => {
  if (!bibleVerse) return null;

  const parsedTopic = parseReference(topic);
  if (!parsedTopic) return null;

  const questions: FillInTheBlankQuestion[] = [];
  const lines = bibleVerse.trim().split('\n');

  for (const line of lines) {
    const lineMatch = line.match(/^(\d+:\d+)\s(.+)/s);
    if (!lineMatch) continue;

    const verseRefStr = lineMatch[1];
    const verseText = lineMatch[2].trim();

    const eligibleWords = verseText.split(/\s+/).filter(w => w.length >= 2 && !/[.,;?!:'"()]/.test(w));
    if (eligibleWords.length === 0) continue;

    const answer = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const answerIndex = verseText.indexOf(answer);
    if (answerIndex === -1) continue;

    const part1 = verseText.substring(0, answerIndex);
    const part2 = verseText.substring(answerIndex + answer.length);

    const question: FillInTheBlankQuestion = {
      type: QuestionType.FILL_IN_THE_BLANK,
      verseReference: `${parsedTopic.book} ${verseRefStr}`,
      verseTextParts: [part1, '___', part2],
      answers: [answer],
    };
    questions.push(question);
  }

  if (questions.length === 0) return null;

  return {
    topic: `${topic} (기본 퀴즈)`,
    questions,
  };
};

// AI에게 보내는 프롬프트에 현재 학습 중인 성경 본문 컨텍스트를 강제로 주입합니다.
const constructEnforcedPrompt = (userMessage: string, topic: string, bibleVerse: string | null): string => {
  if (!bibleVerse) {
    // 본문이 아직 로드되지 않은 경우, 원본 메시지를 그대로 반환합니다.
    return userMessage;
  }
  return `
매우 중요한 규칙: 당신의 모든 답변, 질문, 퀴즈는 반드시 아래 제공된 성경 본문에만 근거해야 합니다.
다른 어떤 성경 구절도 절대로 참조하거나 인용해서는 안 됩니다. 이 규칙을 어기면 안 됩니다.

[현재 학습 본문: ${topic}]
---
${bibleVerse}
---

이제 위의 규칙과 본문을 바탕으로 사용자의 다음 요청에 응답하세요:
"${userMessage}"
`.trim();
};

// 문자열 비교를 위해 공백과 구두점을 제거하고 소문자로 변환합니다.
const normalizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/[\s.,;:?!'"`“‘”’]/g, '').toLowerCase();
};

/**
 * 정답을 확인할 때, 사용자가 조사(예: '을/를', '이/가')를 생략하거나 추가한 경우에도
 * 정답으로 처리하기 위한 유연한 비교 함수입니다.
 * @param userAnswer 사용자가 입력한 답변
 * @param correctAnswer 실제 정답
 * @returns 정답 여부 (boolean)
 */
const isAnswerCorrect = (userAnswer: string, correctAnswer: string): boolean => {
    const userNorm = normalizeText(userAnswer);
    const correctNorm = normalizeText(correctAnswer);

    // 1. 완전 일치 (가장 일반적인 경우)
    if (userNorm === correctNorm) {
        return true;
    }
    
    // 2. 조사 생략/추가 허용 로직
    const shorter = userNorm.length < correctNorm.length ? userNorm : correctNorm;
    const longer = userNorm.length < correctNorm.length ? correctNorm : userNorm;

    // - 짧은 쪽 답변이 너무 짧지 않아야 함 (예: 한 글자짜리 오타 방지)
    // - 긴 쪽 답변이 짧은 쪽 답변으로 시작해야 함
    // - 길이 차이가 2 이하이어야 함 (일반적인 한국어 조사 길이)
    if (shorter.length > 1 && longer.startsWith(shorter) && (longer.length - shorter.length <= 2)) {
        return true;
    }

    return false;
};

// ---------------- 메인 컴포넌트 ----------------
const ConversationalLearning: React.FC<ConversationalLearningProps> = ({ savedSession, onStateChange, onFinish, onBack, onSaveAndExit, onSkip, onSystemBack }) => {
  const { topic, aiModel, mode, apiKey: encryptedApiKey } = savedSession;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<LearningStep>(savedSession.currentStep);
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(savedSession.messages || []);
  const [error, setError] = useState<string | null>(null);
  
  const [bibleVerse, setBibleVerse] = useState<string | null>(savedSession.bibleVerse);
  const [bibleVerseSource, setBibleVerseSource] = useState<'DB' | 'AI' | null>(savedSession.bibleVerse ? 'DB' : null);
  const [verseFetchError, setVerseFetchError] = useState<string | null>(null);

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
  const isInitialized = useRef(false);
  
  
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

  const stepMatch = cleanedText.match(/\[NEXT_STEP:([\w_]+)\]/); // Allow underscores
  if (stepMatch && stepMatch[1]) {
    const nextStepKey = stepMatch[1].toUpperCase() as keyof typeof LearningStep;
    const stepValue = LearningStep[nextStepKey];
    if (stepValue) result.stepChangedTo = stepValue;
    cleanedText = cleanedText.replace(stepMatch[0], '').trim();
  }

  const testMatch = cleanedText.match(/\[START_TEST\]/);
  if (testMatch) {
    cleanedText = cleanedText.replace(testMatch[0], '').trim();
    let quizJsonString = '';
    try {
      const jsonStartIndex = cleanedText.search(/[{\[]/);
      if (jsonStartIndex !== -1) {
        const originalTextBeforeJson = cleanedText.substring(0, jsonStartIndex).trim();
        let rawJsonString = cleanedText.substring(jsonStartIndex);
        
        const lastBracket = rawJsonString.lastIndexOf(']');
        const lastBrace = rawJsonString.lastIndexOf('}');
        const jsonEndIndex = Math.max(lastBracket, lastBrace);
        
        quizJsonString = jsonEndIndex > -1 ? rawJsonString.substring(0, jsonEndIndex + 1) : rawJsonString;

        const parsedQuiz = JSON.parse(quizJsonString) as Quiz;
        
        if (parsedQuiz && parsedQuiz.questions) {
            if (bibleVerse) {
                const sessionRef = parseReference(topic);
                if (sessionRef) {
                    parsedQuiz.questions = parsedQuiz.questions.filter(q => {
                        const questionRef = parseReference(q.verseReference);
                        if (!questionRef || sessionRef.book !== questionRef.book || sessionRef.chapter !== questionRef.chapter) return false;
                        if (!questionRef.verses.every(v => sessionRef.verses.includes(v))) return false;
                        if (q.type === QuestionType.FILL_IN_THE_BLANK) {
                            const verseStringFromParts = q.verseTextParts.join('').replace(/___/g, '');
                            if (!normalizeText(bibleVerse).includes(normalizeText(verseStringFromParts))) return false;
                        }
                        return true;
                    });
                }
            }
        }

        if (parsedQuiz.questions.length > 0) {
            result.quizStarted = parsedQuiz;
            cleanedText = originalTextBeforeJson;
        } else {
            console.warn("AI generated 0 valid questions. Generating fallback quiz.");
            const fallbackQuiz = createFallbackQuiz(topic, bibleVerse);
            if (fallbackQuiz) {
                result.quizStarted = fallbackQuiz;
                cleanedText = "AI가 생성한 퀴즈에 오류가 있어, 시스템이 생성한 기본 빈칸 채우기 퀴즈를 시작합니다.\n\n" + originalTextBeforeJson;
            } else {
                result.quizStarted = undefined;
                cleanedText = "AI 퀴즈 생성에 실패했으며, 대체 퀴즈도 만들 수 없습니다. 대화로 돌아갑니다. 다시 시도해주세요.";
            }
        }
      } else {
        console.warn("[START_TEST] tag found, but no JSON object followed. Generating fallback quiz.");
        const fallbackQuiz = createFallbackQuiz(topic, bibleVerse);
        if (fallbackQuiz) {
            result.quizStarted = fallbackQuiz;
            cleanedText = "AI가 퀴즈 데이터를 생성하지 못해, 시스템이 생성한 기본 빈칸 채우기 퀴즈를 시작합니다.\n\n" + cleanedText;
        } else {
            result.quizStarted = undefined;
            cleanedText = "AI 퀴즈 생성에 실패했으며, 대체 퀴즈도 만들 수 없습니다. 대화로 돌아갑니다. 다시 시도해주세요.";
        }
      }
    } catch (e) {
      console.error("Error parsing AI quiz JSON. Generating fallback quiz.", e);
      const fallbackQuiz = createFallbackQuiz(topic, bibleVerse);
      if (fallbackQuiz) {
          result.quizStarted = fallbackQuiz;
          cleanedText = "AI가 생성한 퀴즈 형식에 오류가 있어, 시스템이 생성한 기본 빈칸 채우기 퀴즈를 시작합니다.";
      } else {
          const detailedError = `퀴즈 데이터를 처리하는 중 오류가 발생했습니다. 대체 퀴즈 생성에도 실패했습니다. 오류: ${e instanceof Error ? e.message : String(e)}`;
          setError(detailedError);
          cleanedText = "";
      }
    }
  }

  const completeMatch = cleanedText.match(/\[COMPLETE\]/);
  if (completeMatch) {
    result.isComplete = true;
    cleanedText = cleanedText.replace(completeMatch[0], '').trim();
  }

  result.cleanedText = cleanedText;
  return result;
}, [bibleVerse, topic]); 

  const sendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading) return;

    // The user-facing message is clean. It's stored in UI state and history.
    const newUserMessage: ChatMessage = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);
    setError(null);
  
    try {
        // The API-facing message is enforced with context just before sending.
        const finalApiMessage = constructEnforcedPrompt(messageContent, topic, bibleVerse);
        let responseText: string;
        
        // Pass topic and mode to ensure system instruction is correct every time.
        if (aiModel === 'perplexity' && decryptedApiKey) {
            responseText = await continuePerplexityConversation(chatHistory, finalApiMessage, topic, mode, decryptedApiKey);
        } else if (aiModel === 'chatgpt') {
            responseText = await continueChatGptConversation(chatHistory, finalApiMessage, topic, mode);
        } else {
            responseText = await continueGeminiConversation(chatHistory, finalApiMessage, topic, mode);
        }

        const newModelMessage: ChatMessage = { role: 'model', content: responseText }; // Raw response
        const processed = processAIResponse(responseText);
  
        // Store the clean user message and the raw model message in history.
        const newHistory = [...chatHistory, newUserMessage, newModelMessage];
        setChatHistory(newHistory);
        
        // Display the processed model message in the UI, if any text remains
        if(processed.cleanedText) {
          setMessages(prev => [...prev, { role: 'model', content: processed.cleanedText }]);
        }
  
        if (processed.stepChangedTo) setCurrentStep(processed.stepChangedTo);
        if (processed.quizStarted) {
            setQuizData(processed.quizStarted);
        }
        if (processed.isComplete) setIsCompleted(true);
  
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setMessages(prev => prev.slice(0, -1)); // Remove the user message that failed
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, chatHistory, aiModel, decryptedApiKey, processAIResponse, topic, bibleVerse, mode]);
  
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
    const isTestStep = currentStep === LearningStep.MEMORIZE_AND_TEST || currentStep === LearningStep.TEST;
    const isPreTestStep = 
      (mode === 'general' && currentStep === LearningStep.APPLICATION) ||
      (mode === 'advanced' && currentStep === LearningStep.MEMORIZATION);

    let message = "준비되었습니다. 다음 단계로 넘어가 주세요.";

    if ((isPreTestStep || isTestStep) && !quizData) {
        if (bibleVerse) {
            message = `이전 단계 학습이 완료되었습니다. 이제 시험을 시작하겠습니다. 시스템 지침에 따라 '${topic}' 본문에 대한 퀴즈 JSON을 생성해주세요.

퀴즈의 모든 내용은 반드시 아래 제공된 성경 본문만을 사용하여 생성해야 합니다. 다른 구절을 참조하면 생성된 퀴즈가 거부됩니다.

[퀴즈 출제용 본문: ${topic}]
---
${bibleVerse}
---
`;
        } else {
            message = `이전 단계 학습이 완료되었습니다. 이제 시험을 시작하겠습니다. 시스템 지침에 따라 '${topic}' 본문에 대한 퀴즈 JSON을 생성해주세요.`;
        }
    }
    
    sendMessage(message);
  };

    // Effect for setting up the session (fetching verse, decrypting key)
    useEffect(() => {
        const setupSession = async () => {
            setIsLoading(true);
            setError(null);
    
            try {
                // Fetch verse if not already in session state
                if (!savedSession.bibleVerse) {
                    const result = await getBibleVerse(topic);
                    if (result.text) {
                        setBibleVerse(result.text);
                        setBibleVerseSource('DB');
                    }
                    setVerseFetchError(result.error);
                }
    
                // Decrypt API key if needed
                if (encryptedApiKey && aiModel === 'perplexity') {
                    const session = await supabase.auth.getSession();
                    if (!session.data.session?.access_token) {
                        throw new Error("API 키를 복호화하기 위한 인증 토큰을 찾을 수 없습니다.");
                    }
                    const plainApiKey = await decrypt(encryptedApiKey, session.data.session.access_token);
                    setDecryptedApiKey(plainApiKey);
                }
    
                // If there's existing chat history, restore it
                if (savedSession.messages && savedSession.messages.length > 0) {
                    const cleanedMessages = savedSession.messages.map(msg => {
                        if (msg.role === 'model') {
                            return { ...msg, content: processAIResponse(msg.content).cleanedText };
                        }
                        // User messages are now stored clean, so return as is.
                        return msg;
                    });
                    setMessages(cleanedMessages);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : '세션 설정 중 오류가 발생했습니다.');
            } finally {
                setIsLoading(false);
            }
        };
    
        setupSession();
    }, []); // Run only on initial mount
    
    // Effect for starting the conversation once setup is complete
    useEffect(() => {
        // Conditions to start a new conversation:
        // 1. Not currently loading.
        // 2. Conversation has not been started yet (isInitialized ref).
        // 3. There is no existing chat history.
        // 4. We have the bible verse (or there was an error, we proceed anyway).
        const canStart = !isLoading && !isInitialized.current && chatHistory.length === 0 && (bibleVerse || verseFetchError);

        if (canStart) {
            isInitialized.current = true; // Mark as initialized to prevent re-triggering
            sendMessage("학습을 시작해주세요.");
        }
    }, [isLoading, chatHistory, bibleVerse, verseFetchError, sendMessage]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isInitialized.current && chatHistory.length === 0) return;

    const newState: LearningSessionState = {
      topic: topic,
      aiModel: aiModel,
      mode: mode,
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
  }, [chatHistory, currentStep, bibleVerse, quizData, currentQuestionIndex, score, isCompleted, onStateChange, topic, aiModel, mode, encryptedApiKey]);
  
  const handleQuizSubmit = (userAnswers: string[]): boolean => {
    const currentQuestion = quizData?.questions[currentQuestionIndex];
    if (!currentQuestion) return false;

    let isCorrect = false;
    if (currentQuestion.type === QuestionType.FILL_IN_THE_BLANK) {
        if (userAnswers.length !== currentQuestion.answers.length || currentQuestion.answers.length === 0) {
            return false;
        }
        isCorrect = userAnswers.every((ans, i) => 
            isAnswerCorrect(ans, currentQuestion.answers[i])
        );
    } else if (currentQuestion.type === QuestionType.QUESTION_ANSWER) {
        if (userAnswers.length !== 1) {
            return false;
        }
        isCorrect = isAnswerCorrect(userAnswers[0], currentQuestion.answer);
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
      onFinish(finalScore, totalQuestions);
    }
  };

  const handleQuizSkip = () => {
    onSkip();
  };

  const StepSelectionModal: React.FC = () => {
    if (!isStepModalOpen) return null;
    const allSteps = Object.values(LearningStep);
    const steps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);

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
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center bg-slate-800/50 rounded-2xl shadow-inner border border-red-700">
        <h2 className="text-2xl font-bold text-red-400 mb-4">대화 중 오류 발생</h2>
        <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap w-full">{error}</pre>
        <button
          onClick={onBack}
          className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
        >
          돌아가기
        </button>
      </div>
    );
  }
  
  const currentQuestion = quizData?.questions?.[currentQuestionIndex];

  return (
    <>
    <StepSelectionModal />
    {quizData ? (
      <div className="w-full max-w-7xl mx-auto p-2 sm:p-6 flex items-center justify-center">
        {currentQuestion ? (
            <QuizCard
              question={currentQuestion}
              questionNumber={currentQuestionIndex + 1}
              totalQuestions={quizData.questions.length}
              onSubmit={handleQuizSubmit}
              onNext={handleQuizNext}
              onSkip={handleQuizSkip}
            />
        ) : (
            <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center bg-slate-800/50 rounded-2xl shadow-inner border border-red-700">
                <h2 className="text-2xl font-bold text-red-400 mb-4">퀴즈 표시 오류</h2>
                <p className="text-slate-300 mb-6">
                    AI가 퀴즈를 생성했지만 표시할 유효한 문제가 없습니다.
                    <br />
                    이는 보통 AI가 생성한 문제가 현재 학습 중인 성경 구절과 일치하지 않아 모두 필터링되었을 때 발생합니다.
                </p>
                <button
                    onClick={() => setQuizData(null)}
                    className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
                >
                    대화로 돌아가기
                </button>
            </div>
        )}
      </div>
    ) : (
      <div className="w-full h-[95vh] max-w-7xl mx-auto p-2 sm:p-6 flex flex-col sm:flex-row gap-6">
        <BibleVersePanel topic={topic} verse={bibleVerse} source={bibleVerseSource} fetchError={verseFetchError} />
        <div className="flex-1 flex flex-col bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0 gap-4">
            <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-slate-100 truncate" title={topic}>{topic}</h2>
                <p className="text-xs text-blue-400 mt-1">
                    AI 모델: {AI_MODEL_DISPLAY_NAMES[aiModel]} ({mode === 'general' ? '일반 학습' : '심화 학습'})
                </p>
            </div>
            
            {/* --- Desktop Buttons --- */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <StepControl onStepSelect={handleForceStepChange} currentStep={currentStep} isLoading={isLoading} mode={mode} />
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
            <ProgressTracker currentStep={currentStep} mode={mode}/>
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
                    onClick={() => onFinish(score, quizData?.questions.length || 0)}
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