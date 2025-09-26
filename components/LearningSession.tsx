import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Quiz, ChatMessage, LearningSessionState } from '../types';
import { LearningStep } from '../constants';
import { QuestionType } from '../types';
import QuizCard from './QuizCard';
import { isAnswerCorrect } from '../services/learningSessionUtils';
import { useBibleVerse } from '../hooks/useBibleVerse';
import { useAIConversation, ProcessedResponse } from '../hooks/useAIConversation';

import ProgressTracker from './learning/ProgressTracker';
import BibleVersePanel from './learning/BibleVersePanel';
import StepControl from './learning/StepControl';
import LoadingDots from './learning/LoadingDots';
import StepSelectionModal from './learning/StepSelectionModal';
import PrayerModal from './PrayerModal';
import { generatePrayerForTopic as generateGeminiPrayer } from '../services/geminiService';
import { generatePrayerForTopic as generatePerplexityPrayer } from '../services/perplexityService';
import { generatePrayerForTopic as generateChatGptPrayer } from '../services/chatgptService';


interface ConversationalLearningProps {
  savedSession: LearningSessionState;
  onStateChange: (newState: LearningSessionState) => void;
  onFinish: () => void;
  onBack: () => void;
  onSaveAndExit: () => void;
  onSkip: () => void;
  onSystemBack: () => void;
}

const AI_MODEL_DISPLAY_NAMES: Record<LearningSessionState['aiModel'], string> = {
  gemini: 'Gemini 2.5 Flash',
  perplexity: 'Perplexity Sonar',
  chatgpt: 'ChatGPT 4o'
};

const ConversationalLearning: React.FC<ConversationalLearningProps> = ({ savedSession, onStateChange, onFinish, onBack, onSaveAndExit, onSkip, onSystemBack }) => {
  const { topic, aiModel, mode } = savedSession;
  
  // State Management
  const [currentStep, setCurrentStep] = useState<LearningStep>(savedSession.currentStep);
  const [userInput, setUserInput] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const [quizData, setQuizData] = useState<Quiz | null>(savedSession.quizData);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(savedSession.currentQuestionIndex);
  const [score, setScore] = useState(savedSession.score);
  const [isCompleted, setIsCompleted] = useState(savedSession.isComplete ?? false);
  
  // UI State
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  // Prayer Flow State
  const [isGeneratingPrayer, setIsGeneratingPrayer] = useState(false);
  const [prayerText, setPrayerText] = useState<string | null>(null);
  const [isPrayerModalOpen, setIsPrayerModalOpen] = useState(false);

  // Custom Hooks
  const { bibleVerse, setBibleVerse, bibleVerseSource, setBibleVerseSource, verseFetchError, isFetching: isFetchingVerse } = useBibleVerse(topic, savedSession.bibleVerse);
  const { messages, setMessages, chatHistory, setChatHistory, isLoading, error, setError, sendMessage, processedResponse } = useAIConversation({
    initialChatHistory: savedSession.messages || [],
    topic,
    mode,
    aiModel,
    bibleVerse,
  });

  // Effect to handle side-effects from AI responses
  useEffect(() => {
    if (processedResponse) {
      if (processedResponse.cleanedText) {
        setMessages(prev => [...prev, { role: 'model', content: processedResponse.cleanedText }]);
      }
      if (processedResponse.verseExtracted) {
        setBibleVerse(processedResponse.verseExtracted);
        setBibleVerseSource('AI');
      }
      if (processedResponse.stepChangedTo) setCurrentStep(processedResponse.stepChangedTo);
      if (processedResponse.quizStarted) setQuizData(processedResponse.quizStarted);
      if (processedResponse.isComplete) setIsCompleted(true);
      if (processedResponse.evaluationFeedback) {
        setAiFeedback(processedResponse.evaluationFeedback);
      }
    }
  }, [processedResponse, setBibleVerse, setBibleVerseSource]);
  
  // Effect for starting conversation
  useEffect(() => {
    // FIX: Removed the `chatHistory.length === 0` condition.
    // This condition was preventing the message restoration logic from running for resumed sessions,
    // as `chatHistory` is intentionally populated from the start in those cases.
    // The `isInitialized` ref is sufficient to ensure this effect runs only once.
    const canStart = !isLoading && !isFetchingVerse && !isInitialized.current && (bibleVerse || verseFetchError);

    if (canStart) {
      isInitialized.current = true;
      if (savedSession.messages && savedSession.messages.length > 0) {
          // Restore messages from saved session
          const cleanedMessages = savedSession.messages.map(msg => {
              if (msg.role === 'model' && msg.content.includes('[START_TEST]')) {
                  // Don't show the JSON part of the test message
                  const jsonStartIndex = msg.content.search(/[{\[]/);
                  const content = jsonStartIndex !== -1 ? msg.content.substring(0, jsonStartIndex).trim() : msg.content;
                  return { ...msg, content };
              }
              return msg;
          });
          setMessages(cleanedMessages);
      } else {
          // Start a new conversation
          sendMessage("학습을 시작해주세요.", { enforcePassageOnly: true });
      }
    }
  }, [isLoading, isFetchingVerse, bibleVerse, verseFetchError, sendMessage, savedSession.messages, setMessages]);
  
  // Effect for saving state
  useEffect(() => {
    if (!isInitialized.current && chatHistory.length === 0) return;
    const newState: LearningSessionState = {
      topic, aiModel, mode,
      messages: chatHistory, currentStep, bibleVerse,
      quizData, currentQuestionIndex, score, isComplete: isCompleted,
    };
    onStateChange(newState);
  }, [chatHistory, currentStep, bibleVerse, quizData, currentQuestionIndex, score, isCompleted, onStateChange, topic, aiModel, mode]);

  // Other Effects (scrolling, back button, etc.)
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    window.history.pushState({ page: 'learning-session' }, '');
    const handleBackButton = () => onSystemBack();
    window.addEventListener('popstate', handleBackButton);
    return () => window.removeEventListener('popstate', handleBackButton);
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

  // Event Handlers
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    // User-submitted questions should allow for flexible, expanded answers.
    sendMessage(userInput, { enforcePassageOnly: false });
    setUserInput('');
  };

  const handleForceStepChange = (step: LearningStep) => {
    if (currentStep === step) return;
    
    // 낙관적 UI 업데이트: AI 응답을 기다리지 않고 즉시 UI를 변경하여 반응성을 높입니다.
    setCurrentStep(step);
    
    const message = `[사용자 액션] '${step}' 단계로 강제 이동합니다.`;
    // 시스템 주도 명령어는 현재 구절만 참조해야 합니다.
    sendMessage(message, { enforcePassageOnly: true });
  };

  const handleAdvanceStepRequest = () => {
    const isPreTestStep =
      (mode === 'general' && currentStep === LearningStep.APPLICATION) ||
      (mode === 'advanced' && currentStep === LearningStep.MEMORIZATION);
  
    // '시험' 단계로 넘어갈 때는 특별한 퀴즈 생성 프롬프트가 필요합니다.
    // 이 경우, AI가 유효한 퀴즈를 생성했을 때만 단계가 변경되므로 낙관적 업데이트를 사용하지 않습니다.
    if (isPreTestStep && !quizData) {
      const message = bibleVerse
        ? `이전 단계 학습이 완료되었습니다. 이제 시험을 시작하겠습니다. 시스템 지침에 따라 '${topic}' 본문에 대한 퀴즈 JSON을 생성해주세요.\n\n퀴즈의 모든 내용은 반드시 아래 제공된 성경 본문만을 사용하여 생성해야 합니다. 다른 구절을 참조하면 생성된 퀴즈가 거부됩니다.\n\n[퀴즈 출제용 본문: ${topic}]\n---\n${bibleVerse}\n---`
        : `이전 단계 학습이 완료되었습니다. 이제 시험을 시작하겠습니다. 시스템 지침에 따라 '${topic}' 본문에 대한 퀴즈 JSON을 생성해주세요.`;
      sendMessage(message, { enforcePassageOnly: true });
      return;
    }
  
    // '관찰' -> '해석'과 같은 일반적인 단계 전환의 경우입니다.
    const allSteps = Object.values(LearningStep);
    const modeSteps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);
    const currentIndex = modeSteps.indexOf(currentStep);
  
    if (currentIndex < modeSteps.length - 1) {
      const nextStep = modeSteps[currentIndex + 1];
      
      // 낙관적 UI 업데이트: UI 상태를 즉시 변경합니다.
      setCurrentStep(nextStep);
      
      // AI에게 사용자가 단계를 변경했음을 알립니다.
      const message = `[사용자 액션] 사용자가 다음 단계인 '${nextStep}'로 이동했습니다. 이 단계에 맞는 첫 번째 질문을 시작해주세요.`;
      sendMessage(message, { enforcePassageOnly: true });
    } else {
      // 이미 마지막 단계에 있는 경우에 대한 fallback 처리입니다.
      sendMessage("현재 마지막 단계입니다. 퀴즈를 풀어주세요.", { enforcePassageOnly: true });
    }
  };
  
  const handleQuizSubmit = useCallback((userAnswers: string[]): boolean => {
    const currentQuestion = quizData?.questions[currentQuestionIndex];
    if (!currentQuestion) return false;

    if (currentQuestion.type === QuestionType.FILL_IN_THE_BLANK) {
      const isCorrect = userAnswers.every((ans, i) => isAnswerCorrect(ans, currentQuestion.answers[i]));
      if (isCorrect) setScore(prev => prev + 1);
      return isCorrect;
    } else if (currentQuestion.type === QuestionType.QUESTION_ANSWER) {
      setAiFeedback(null);
      sendMessage(`[시스템 액션] 다음 답변을 평가해주세요: ${userAnswers[0]}`, { enforcePassageOnly: false });
      return false; // 정답 여부를 즉시 알 수 없으므로 false를 반환합니다.
    }

    return false;
  }, [quizData, currentQuestionIndex, sendMessage, setScore]);

  const handleQuizNext = useCallback(() => {
    if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setAiFeedback(null);
    } else {
      // 퀴즈의 마지막 문제입니다. isCompleted를 true로 설정하여
      // '학습 완료' 버튼이 표시되도록 합니다.
      setIsCompleted(true);
    }
  }, [quizData, currentQuestionIndex]);

  const handleRequestPrayer = useCallback(async () => {
    setIsGeneratingPrayer(true);
    let generatedPrayer: string | null = null;
    try {
        switch (aiModel) {
            case 'perplexity':
                generatedPrayer = await generatePerplexityPrayer(topic, mode);
                break;
            case 'chatgpt':
                generatedPrayer = await generateChatGptPrayer(topic, mode);
                break;
            case 'gemini':
            default:
                generatedPrayer = await generateGeminiPrayer(topic, mode);
                break;
        }
    } catch (e) {
        console.warn("기도문 생성에 실패했습니다:", e);
        generatedPrayer = "기도문 생성에 실패했습니다. AI의 안전 설정에 의해 차단되었거나 네트워크 문제가 발생했을 수 있습니다. 잠시 후 다시 시도해 주세요.";
    } finally {
        setPrayerText(generatedPrayer);
        setIsGeneratingPrayer(false);
        setIsPrayerModalOpen(true);
    }
  }, [aiModel, topic, mode]);


  // Render Logic
  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center bg-slate-800/50 rounded-2xl shadow-inner border border-red-700">
        <h2 className="text-2xl font-bold text-red-400 mb-4">대화 중 오류 발생</h2>
        <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap w-full">{error}</pre>
        <button onClick={onBack} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors">돌아가기</button>
      </div>
    );
  }
  
  const currentQuestion = quizData?.questions?.[currentQuestionIndex];

  if (quizData && !isCompleted) {
    return (
      <div className="w-full max-w-7xl mx-auto p-2 sm:p-6 flex items-center justify-center">
        {currentQuestion ? (
            <QuizCard 
                question={currentQuestion} 
                questionNumber={currentQuestionIndex + 1} 
                totalQuestions={quizData.questions.length} 
                onSubmit={handleQuizSubmit} 
                onNext={handleQuizNext} 
                onSkip={onSkip}
                aiFeedback={aiFeedback}
                isEvaluating={isLoading}
            />
        ) : (
            <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center bg-slate-800/50 rounded-2xl shadow-inner border border-red-700">
                <h2 className="text-2xl font-bold text-red-400 mb-4">퀴즈 표시 오류</h2>
                <p className="text-slate-300 mb-6">AI가 퀴즈를 생성했지만 표시할 유효한 문제가 없습니다.<br/>이는 보통 생성된 문제가 현재 학습 중인 성경 구절과 일치하지 않아 모두 필터링되었을 때 발생합니다.</p>
                <button onClick={() => setQuizData(null)} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors">대화로 돌아가기</button>
            </div>
        )}
      </div>
    );
  }

  return (
    <>
      <StepSelectionModal isOpen={isStepModalOpen} onClose={() => setIsStepModalOpen(false)} onSelect={handleForceStepChange} currentStep={currentStep} mode={mode} />
      {prayerText && (
          <PrayerModal
              isOpen={isPrayerModalOpen}
              onClose={() => setIsPrayerModalOpen(false)}
              prayerText={prayerText}
              topic={topic}
              onConfirm={() => {
                  setIsPrayerModalOpen(false);
                  onFinish();
              }}
              confirmButtonText="학습 완료"
          />
      )}
      <div className="w-full h-[95vh] max-w-7xl mx-auto p-2 sm:p-6 flex flex-col sm:flex-row gap-6">
        <BibleVersePanel topic={topic} verse={bibleVerse} source={bibleVerseSource} fetchError={verseFetchError} />
        <div className="flex-1 flex flex-col bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0 gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-100 truncate" title={topic}>{topic}</h2>
              <p className="text-xs text-blue-400 mt-1">AI 모델: {AI_MODEL_DISPLAY_NAMES[aiModel]} ({mode === 'general' ? '일반 학습' : '심화 학습'})</p>
            </div>
            
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <StepControl onStepSelect={handleForceStepChange} currentStep={currentStep} isLoading={isLoading || isCompleted} mode={mode} />
              <button onClick={handleAdvanceStepRequest} disabled={isLoading || isCompleted} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:bg-slate-600 transition-colors">다음 단계로</button>
              <button onClick={onSaveAndExit} disabled={isCompleted} className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:text-slate-500 disabled:bg-transparent disabled:cursor-not-allowed">저장 후 종료</button>
            </div>

            <div className="relative sm:hidden flex-shrink-0" ref={optionsMenuRef}>
              <button onClick={() => setIsOptionsOpen(prev => !prev)} className="p-2 rounded-full hover:bg-slate-700 transition-colors" aria-label="옵션" aria-haspopup="true" aria-expanded={isOptionsOpen}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
              </button>
              {isOptionsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
                  <ul className="py-1" role="menu">
                    <li role="none"><button onClick={() => { setIsOptionsOpen(false); setIsStepModalOpen(true); }} disabled={isLoading || isCompleted} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500" role="menuitem">단계 이동</button></li>
                    <li role="none"><button onClick={() => { handleAdvanceStepRequest(); setIsOptionsOpen(false); }} disabled={isLoading || isCompleted} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500" role="menuitem">다음 단계로</button></li>
                    <li role="none"><button onClick={() => { onSaveAndExit(); setIsOptionsOpen(false); }} disabled={isCompleted} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500" role="menuitem">저장 후 종료</button></li>
                  </ul>
                </div>
              )}
            </div>
          </div>
          
          {/* Progress Tracker */}
          <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-700"><ProgressTracker currentStep={currentStep} mode={mode}/></div>

          {/* Chat Area */}
          <div ref={chatContainerRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xl px-5 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-slate-700 text-slate-200 rounded-bl-lg'}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (<div className="flex justify-start"><div className="max-w-xl px-5 py-3 rounded-2xl bg-slate-700 text-slate-200 rounded-bl-lg"><LoadingDots /></div></div>)}
          </div>

          {/* Input Form / Completion Button */}
          {isCompleted ? (
            <div className="p-4 sm:p-6 border-t border-slate-700 flex-shrink-0 text-center animate-fade-in">
                <style>{`
                    @keyframes fade-in {
                      from { opacity: 0; transform: translateY(10px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                    .animate-fade-in {
                      animation: fade-in 0.5s ease-out forwards;
                    }
                `}</style>
                <h3 className="text-2xl font-bold text-slate-100">수고하셨습니다!</h3>
                <p className="text-slate-300 mt-2 mb-4">
                    퀴즈 결과: {score} / {quizData?.questions.length || 0}
                </p>
                <button
                    onClick={handleRequestPrayer}
                    disabled={isGeneratingPrayer}
                    className="w-full max-w-xs mx-auto px-5 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-500 transition-colors text-lg disabled:bg-slate-600 disabled:cursor-wait">
                    {isGeneratingPrayer ? '기도문 생성 중...' : '기도하기'}
                </button>
            </div>
          ) : (
            <div className="p-4 sm:p-6 border-t border-slate-700 flex-shrink-0">
              <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
                <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="메시지를 입력하세요..." disabled={isLoading} className="flex-1 w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"/>
                <button type="submit" disabled={isLoading || !userInput.trim()} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors">전송</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ConversationalLearning;