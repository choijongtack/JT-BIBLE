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
  const [selectedMessageIndexes, setSelectedMessageIndexes] = useState<Set<number>>(new Set());
  
  // UI State
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const [isVerseVisibleOnMobile, setIsVerseVisibleOnMobile] = useState(false);
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
    
    // ?숆???UI ?낅뜲?댄듃: AI ?묐떟??湲곕떎由ъ? ?딄퀬 利됱떆 UI瑜?蹂寃쏀븯??諛섏쓳?깆쓣 ?믪엯?덈떎.
    setCurrentStep(step);
    
    const message = `[?ъ슜???≪뀡] '${step}' ?④퀎濡?媛뺤젣 ?대룞?⑸땲??`;
    // ?쒖뒪??二쇰룄 紐낅졊?대뒗 ?꾩옱 援ъ젅留?李몄“?댁빞 ?⑸땲??
    sendMessage(message, { enforcePassageOnly: true });
  };

  const handleAdvanceStepRequest = () => {
    const isPreTestStep =
      (mode === 'general' && currentStep === LearningStep.APPLICATION) ||
      (mode === 'advanced' && currentStep === LearningStep.MEMORIZATION);
  
    // '?쒗뿕' ?④퀎濡??섏뼱媛??뚮뒗 ?밸퀎???댁쫰 ?앹꽦 ?꾨＼?꾪듃媛 ?꾩슂?⑸땲??
    // ??寃쎌슦, AI媛 ?좏슚???댁쫰瑜??앹꽦?덉쓣 ?뚮쭔 ?④퀎媛 蹂寃쎈릺誘濡??숆????낅뜲?댄듃瑜??ъ슜?섏? ?딆뒿?덈떎.
    if (isPreTestStep && !quizData) {
      const message = bibleVerse
        ? `?댁쟾 ?④퀎 ?숈뒿???꾨즺?섏뿀?듬땲?? ?댁젣 ?쒗뿕???쒖옉?섍쿋?듬땲?? ?쒖뒪??吏移⑥뿉 ?곕씪 '${topic}' 蹂몃Ц??????댁쫰 JSON???앹꽦?댁＜?몄슂.\n\n?댁쫰??紐⑤뱺 ?댁슜? 諛섎뱶???꾨옒 ?쒓났???깃꼍 蹂몃Ц留뚯쓣 ?ъ슜?섏뿬 ?앹꽦?댁빞 ?⑸땲?? ?ㅻⅨ 援ъ젅??李몄“?섎㈃ ?앹꽦???댁쫰媛 嫄곕??⑸땲??\n\n[?댁쫰 異쒖젣??蹂몃Ц: ${topic}]\n---\n${bibleVerse}\n---`
        : `?댁쟾 ?④퀎 ?숈뒿???꾨즺?섏뿀?듬땲?? ?댁젣 ?쒗뿕???쒖옉?섍쿋?듬땲?? ?쒖뒪??吏移⑥뿉 ?곕씪 '${topic}' 蹂몃Ц??????댁쫰 JSON???앹꽦?댁＜?몄슂.`;
      sendMessage(message, { enforcePassageOnly: true });
      return;
    }
  
    // '愿李? -> '?댁꽍'怨?媛숈? ?쇰컲?곸씤 ?④퀎 ?꾪솚??寃쎌슦?낅땲??
    const allSteps = Object.values(LearningStep);
    const modeSteps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);
    const currentIndex = modeSteps.indexOf(currentStep);
  
    if (currentIndex < modeSteps.length - 1) {
      const nextStep = modeSteps[currentIndex + 1];
      
      // ?숆???UI ?낅뜲?댄듃: UI ?곹깭瑜?利됱떆 蹂寃쏀빀?덈떎.
      setCurrentStep(nextStep);
      
      // AI?먭쾶 ?ъ슜?먭? ?④퀎瑜?蹂寃쏀뻽?뚯쓣 ?뚮┰?덈떎.
      const message = `[?ъ슜???≪뀡] ?ъ슜?먭? ?ㅼ쓬 ?④퀎??'${nextStep}'濡??대룞?덉뒿?덈떎. ???④퀎??留욌뒗 泥?踰덉㎏ 吏덈Ц???쒖옉?댁＜?몄슂.`;
      sendMessage(message, { enforcePassageOnly: true });
    } else {
      // ?대? 留덉?留??④퀎???덈뒗 寃쎌슦?????fallback 泥섎━?낅땲??
      sendMessage("?꾩옱 留덉?留??④퀎?낅땲?? ?댁쫰瑜???댁＜?몄슂.", { enforcePassageOnly: true });
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
      sendMessage(`[?쒖뒪???≪뀡] ?ㅼ쓬 ?듬????됯??댁＜?몄슂: ${userAnswers[0]}`, { enforcePassageOnly: false });
      return false; // ?뺣떟 ?щ?瑜?利됱떆 ?????놁쑝誘濡?false瑜?諛섑솚?⑸땲??
    }

    return false;
  }, [quizData, currentQuestionIndex, sendMessage, setScore]);

  const handleQuizNext = useCallback(() => {
    if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setAiFeedback(null);
    } else {
      // ?댁쫰??留덉?留?臾몄젣?낅땲?? isCompleted瑜?true濡??ㅼ젙?섏뿬
      // '?숈뒿 ?꾨즺' 踰꾪듉???쒖떆?섎룄濡??⑸땲??
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
        console.warn("湲곕룄臾??앹꽦???ㅽ뙣?덉뒿?덈떎:", e);
        generatedPrayer = "湲곕룄臾??앹꽦???ㅽ뙣?덉뒿?덈떎. AI???덉쟾 ?ㅼ젙???섑빐 李⑤떒?섏뿀嫄곕굹 ?ㅽ듃?뚰겕 臾몄젣媛 諛쒖깮?덉쓣 ???덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??";
    } finally {
        setPrayerText(generatedPrayer);
        setIsGeneratingPrayer(false);
        setIsPrayerModalOpen(true);
    }
  }, [aiModel, topic, mode]);

  const toggleMessageSelection = (idx: number) => {
    setSelectedMessageIndexes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const downloadMessages = (onlySelected: boolean) => {
    const source = onlySelected
      ? messages.filter((_, idx) => selectedMessageIndexes.has(idx))
      : messages;

    if (source.length === 0) return;

    const timestamp = new Date().toISOString();
    const body = [
      `Topic: ${topic}`,
      `AI: ${AI_MODEL_DISPLAY_NAMES[aiModel]}`,
      `Mode: ${mode}`,
      `ExportedAt: ${timestamp}`,
      '',
      ...source.map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}\n`),
    ].join('\n');

    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topic.replace(/[\\/:*?"<>|]/g, '_')}_${onlySelected ? 'selected' : 'all'}_chat.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };


  // Render Logic
  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center justify-center text-center bg-slate-800/50 rounded-2xl shadow-inner border border-red-700">
        <h2 className="text-2xl font-bold text-red-400 mb-4">???以??ㅻ쪟 諛쒖깮</h2>
        <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap w-full">{error}</pre>
        <button onClick={onBack} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors">?뚯븘媛湲?</button>
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
                <h2 className="text-2xl font-bold text-red-400 mb-4">?댁쫰 ?쒖떆 ?ㅻ쪟</h2>
                <p className="text-slate-300 mb-6">AI媛 ?댁쫰瑜??앹꽦?덉?留??쒖떆???좏슚??臾몄젣媛 ?놁뒿?덈떎.<br/>?대뒗 蹂댄넻 ?앹꽦??臾몄젣媛 ?꾩옱 ?숈뒿 以묒씤 ?깃꼍 援ъ젅怨??쇱튂?섏? ?딆븘 紐⑤몢 ?꾪꽣留곷릺?덉쓣 ??諛쒖깮?⑸땲??</p>
                <button onClick={() => setQuizData(null)} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors">??붾줈 ?뚯븘媛湲?</button>
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
              confirmButtonText="?숈뒿 ?꾨즺"
          />
      )}
      <style>{`
        @keyframes fade-in-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out forwards;
        }
      `}</style>
      <div className="w-full h-[95vh] max-w-7xl mx-auto p-2 sm:p-6 flex flex-col sm:flex-row gap-6">
        <BibleVersePanel topic={topic} verse={bibleVerse} source={bibleVerseSource} fetchError={verseFetchError} />
        <div className="flex-1 flex flex-col bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0 gap-4">
            <div className="flex-1 min-w-0">
               <button 
                onClick={() => setIsVerseVisibleOnMobile(prev => !prev)} 
                className="w-full text-left sm:hidden"
                aria-expanded={isVerseVisibleOnMobile}
                aria-controls="mobile-verse-panel"
              >
                <h2 className="text-xl font-bold text-slate-100 truncate inline-flex items-center gap-2" title={topic}>
                  {topic}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform ${isVerseVisibleOnMobile ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </h2>
              </button>
              <h2 className="hidden sm:block text-xl font-bold text-slate-100 truncate" title={topic}>{topic}</h2>
              <p className="text-xs text-blue-400 mt-1">
                  AI 紐⑤뜽: {AI_MODEL_DISPLAY_NAMES[aiModel]} ({mode === 'general' ? '?쇰컲 ?숈뒿' : '?ы솕 ?숈뒿'})
                  <span className="font-semibold text-slate-300"> ??{currentStep}</span>
              </p>
            </div>
            
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <StepControl onStepSelect={handleForceStepChange} currentStep={currentStep} isLoading={isLoading || isCompleted} mode={mode} />
              <button onClick={handleAdvanceStepRequest} disabled={isLoading || isCompleted} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:bg-slate-600 transition-colors">?ㅼ쓬 ?④퀎濡?</button>
              <button onClick={onSaveAndExit} disabled={isCompleted} className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:text-slate-500 disabled:bg-transparent disabled:cursor-not-allowed">?????醫낅즺</button>
            </div>

            <div className="relative sm:hidden flex-shrink-0" ref={optionsMenuRef}>
              <button onClick={() => setIsOptionsOpen(prev => !prev)} className="p-2 rounded-full hover:bg-slate-700 transition-colors" aria-label="?듭뀡" aria-haspopup="true" aria-expanded={isOptionsOpen}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
              </button>
              {isOptionsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
                  <ul className="py-1" role="menu">
                    <li role="none"><button onClick={() => { setIsOptionsOpen(false); setIsStepModalOpen(true); }} disabled={isLoading || isCompleted} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500" role="menuitem">?④퀎 ?대룞</button></li>
                    <li role="none"><button onClick={() => { handleAdvanceStepRequest(); setIsOptionsOpen(false); }} disabled={isLoading || isCompleted} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500" role="menuitem">?ㅼ쓬 ?④퀎濡?</button></li>
                    <li role="none"><button onClick={() => { onSaveAndExit(); setIsOptionsOpen(false); }} disabled={isCompleted} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:text-slate-500" role="menuitem">?????醫낅즺</button></li>
                  </ul>
                </div>
              )}
            </div>
          </div>
          
          {/* Desktop Progress Tracker */}
          <div className="hidden sm:block p-4 border-b border-slate-700">
            <ProgressTracker currentStep={currentStep} mode={mode} />
          </div>

          {isVerseVisibleOnMobile && (
            <div id="mobile-verse-panel" className="sm:hidden p-4 bg-slate-900/50 border-b border-slate-700 max-h-48 overflow-y-auto animate-fade-in-down">
                {verseFetchError && (
                    <div className="mb-2 p-2 bg-yellow-900/50 border border-yellow-700 rounded-lg text-xs text-yellow-300">
                        <p className="font-bold mb-1">DB 遺덈윭?ㅺ린 ?ㅽ뙣 (AI ?泥?</p>
                        <p>{verseFetchError}</p>
                    </div>
                )}
                {bibleVerse ? (
                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed text-sm">{bibleVerse}</p>
                ) : (
                     !verseFetchError && <p className="text-slate-400 text-sm">?깃꼍 蹂몃Ц??遺덈윭?ㅻ뒗 以묒엯?덈떎...</p>
                )}
            </div>
          )}

          {/* Chat Area */}
          <div ref={chatContainerRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => downloadMessages(true)}
                disabled={selectedMessageIndexes.size === 0}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                선택 다운로드 ({selectedMessageIndexes.size})
              </button>
              <button
                type="button"
                onClick={() => downloadMessages(false)}
                disabled={messages.length === 0}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                전체 다운로드
              </button>
            </div>
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <label className={`max-w-xl px-5 py-3 rounded-2xl cursor-pointer border ${selectedMessageIndexes.has(index) ? 'border-yellow-400' : 'border-transparent'} ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-slate-700 text-slate-200 rounded-bl-lg'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={selectedMessageIndexes.has(index)}
                      onChange={() => toggleMessageSelection(index)}
                      className="accent-yellow-400"
                    />
                    <span className="text-xs opacity-80">{msg.role === 'user' ? 'USER' : 'AI'}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </label>
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
                <h3 className="text-2xl font-bold text-slate-100">?섍퀬?섏뀲?듬땲??</h3>
                <p className="text-slate-300 mt-2 mb-4">
                    ?댁쫰 寃곌낵: {score} / {quizData?.questions.length || 0}
                </p>
                <button
                    onClick={handleRequestPrayer}
                    disabled={isGeneratingPrayer}
                    className="w-full max-w-xs mx-auto px-5 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-500 transition-colors text-lg disabled:bg-slate-600 disabled:cursor-wait">
                    {isGeneratingPrayer ? '湲곕룄臾??앹꽦 以?..' : '湲곕룄?섍린'}
                </button>
            </div>
          ) : (
            <div className="p-4 sm:p-6 border-t border-slate-700 flex-shrink-0">
              <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
                <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="硫붿떆吏瑜??낅젰?섏꽭??.." disabled={isLoading} className="flex-1 w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"/>
                <button type="submit" disabled={isLoading || !userInput.trim()} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors">?꾩넚</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ConversationalLearning;


