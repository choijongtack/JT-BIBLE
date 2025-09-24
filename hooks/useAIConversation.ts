import { useState, useCallback } from 'react';
import { continueLearningConversation as continueGeminiConversation } from '../services/geminiService';
import { continueLearningConversation as continuePerplexityConversation } from '../services/perplexityService';
import { continueLearningConversation as continueChatGptConversation } from '../services/chatgptService';
import type { ChatMessage, Quiz, LearningSessionState } from '../types';
// FIX: `QuestionType` is exported from `types.ts`, not `constants.ts`. Corrected the import path.
import { LearningStep } from '../constants';
import { QuestionType } from '../types';
import { createFallbackQuiz, constructEnforcedPrompt, normalizeText } from '../services/learningSessionUtils';
import { parseReference } from '../services/bibleUtils';

// FIX: Corrected the malformed ProcessedResponse interface which contained a pasted error message.
export interface ProcessedResponse {
  cleanedText: string;
  stepChangedTo?: LearningStep;
  quizStarted?: Quiz;
  verseExtracted?: string;
  isComplete?: boolean;
  evaluationFeedback?: string;
}

interface UseAIConversationProps {
  initialChatHistory: ChatMessage[];
  topic: string;
  mode: 'general' | 'advanced';
  aiModel: LearningSessionState['aiModel'];
  bibleVerse: string | null;
}

export const useAIConversation = ({ initialChatHistory, topic, mode, aiModel, bibleVerse }: UseAIConversationProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(initialChatHistory);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [processedResponse, setProcessedResponse] = useState<ProcessedResponse | null>(null);

    const processAIResponse = useCallback((text: string): ProcessedResponse => {
        let cleanedText = text;
        const result: ProcessedResponse = { cleanedText: '' };
      
        const evalMatch = cleanedText.match(/\[EVALUATION_RESPONSE\]([\s\S]*)/);
        if (evalMatch && evalMatch[1]) {
          result.evaluationFeedback = evalMatch[1].trim();
          cleanedText = cleanedText.replace(evalMatch[0], '').trim();
        }

        const verseMatch = cleanedText.match(/\[BIBLE_VERSE\]([\s\S]*?)\[\/BIBLE_VERSE\]/);
        if (verseMatch && verseMatch[1]) {
          const verse = verseMatch[1].trim();
          if (verse) result.verseExtracted = verse;
          cleanedText = cleanedText.replace(verseMatch[0], '').trim();
        }
      
        const stepMatch = cleanedText.match(/\[NEXT_STEP:([\w_]+)\]/);
        if (stepMatch && stepMatch[1]) {
          const nextStepKey = stepMatch[1].toUpperCase() as keyof typeof LearningStep;
          const stepValue = LearningStep[nextStepKey];
          if (stepValue) result.stepChangedTo = stepValue;
          cleanedText = cleanedText.replace(stepMatch[0], '').trim();
        }
      
        const testMatchIndex = cleanedText.indexOf('[START_TEST]');
        if (testMatchIndex !== -1) {
          const textBeforeTag = cleanedText.substring(0, testMatchIndex).trim();
          const textAfterTag = cleanedText.substring(testMatchIndex + '[START_TEST]'.length);
          
          let quizJsonString = '';
          try {
            const jsonStartIndex = textAfterTag.search(/[{\[]/);
            if (jsonStartIndex !== -1) {
              const textBetweenTagAndJson = textAfterTag.substring(0, jsonStartIndex).trim();
              const displayText = [textBeforeTag, textBetweenTagAndJson].filter(Boolean).join('\n\n').trim();
              
              let rawJsonString = textAfterTag.substring(jsonStartIndex);
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
                  cleanedText = displayText;
              } else {
                  console.warn("AI generated 0 valid questions. Generating fallback quiz.");
                  const fallbackQuiz = createFallbackQuiz(topic, bibleVerse);
                  if (fallbackQuiz) {
                      result.quizStarted = fallbackQuiz;
                      cleanedText = "AI가 생성한 퀴즈에 오류가 있어, 시스템이 생성한 기본 빈칸 채우기 퀴즈를 시작합니다.\n\n" + displayText;
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
                  cleanedText = "AI가 퀴즈 데이터를 생성하지 못해, 시스템이 생성한 기본 빈칸 채우기 퀴즈를 시작합니다.\n\n" + textBeforeTag;
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
                result.quizStarted = undefined;
                cleanedText = `퀴즈 데이터를 처리하는 중 오류가 발생했습니다. 대체 퀴즈 생성에도 실패했습니다. 오류: ${e instanceof Error ? e.message : String(e)}`;
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

    const sendMessage = useCallback(async (
        messageContent: string,
        options: { enforcePassageOnly: boolean } = { enforcePassageOnly: false }
    ) => {
        if (!messageContent.trim() || isLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', content: messageContent };
        setMessages(prev => [...prev, newUserMessage]);
        setIsLoading(true);
        setError(null);
        setProcessedResponse(null);
    
        try {
            let finalApiMessage: string;
            const isFirstMessage = chatHistory.length === 0;

            if (isFirstMessage && !bibleVerse) {
                // DB에서 본문을 가져오지 못했고, AI와의 첫 대화일 경우,
                // AI에게 본문을 요청하는 지침을 동적으로 생성합니다.
                const firstMissionInstruction = `
[시스템 지시] 당신의 첫 번째 임무는 '${topic}'에 해당하는 전체 성경 본문을 '개역개정판'으로 제공하는 것입니다.
**매우 중요:** 각 절은 반드시 '장:절' 형식의 번호로 시작해야 합니다 (예: '1:1 태초에...'). 이 형식을 지키지 않으면 시스템 오류가 발생하므로 반드시 준수해야 합니다.
본문 전체는 반드시 [BIBLE_VERSE]와 [/BIBLE_VERSE] 태그로 감싸야 합니다.
이 임무를 완수한 후, 사용자의 원래 요청에 응답하여 대화를 시작하세요: "${messageContent}"
                `.trim();
                finalApiMessage = firstMissionInstruction;
            } else {
                // 그 외 모든 경우에는 기존의 컨텍스트 강화 로직을 사용합니다.
                finalApiMessage = constructEnforcedPrompt(messageContent, topic, bibleVerse, options);
            }
            
            let responseText: string;
            
            if (aiModel === 'perplexity') {
                responseText = await continuePerplexityConversation(chatHistory, finalApiMessage, topic, mode);
            } else if (aiModel === 'chatgpt') {
                responseText = await continueChatGptConversation(chatHistory, finalApiMessage, topic, mode);
            } else {
                responseText = await continueGeminiConversation(chatHistory, finalApiMessage, topic, mode);
            }

            const newModelMessage: ChatMessage = { role: 'model', content: responseText };
            setChatHistory(prev => [...prev, newUserMessage, newModelMessage]);
            
            const processed = processAIResponse(responseText);
            setProcessedResponse(processed);
      
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
            setError(errorMessage);
            setMessages(prev => prev.slice(0, -1));
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, chatHistory, aiModel, processAIResponse, topic, bibleVerse, mode]);
    

    return { messages, setMessages, chatHistory, setChatHistory, isLoading, error, setError, sendMessage, processedResponse };
};
