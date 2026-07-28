import { useState, useCallback } from 'react';
import { continueLearningConversation as continueGeminiConversation } from '../services/geminiService';
import { continueLearningConversation as continuePerplexityConversation } from '../services/perplexityService';
import { continueLearningConversation as continueChatGptConversation } from '../services/chatgptService';
import type { ChatMessage, Quiz, LearningSessionState } from '../types';
// FIX: `QuestionType` is exported from `types.ts`, not `constants.ts`. Corrected the import path.
import { LearningStep } from '../constants';
import { QuestionType } from '../types';
import { createFallbackQuiz, constructEnforcedPrompt, normalizeText, isValidQuiz } from '../services/learningSessionUtils';
import { parseReference } from '../services/bibleUtils';
import { buildSystemInstruction } from '../services/instructionTemplate';
import { buildCalvinContextBlock, searchCalvinChunks } from '../services/calvinCitationService';

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

// FIX: Corrected the ApiChatMessage type to only include roles supported by the Perplexity/ChatGPT APIs.
// The 'model' role is specific to our internal state and is mapped to 'assistant' before being sent.
type ApiChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const CALVIN_CITATION_POLICY = `
[출처 인용 규칙 - 필수]
- 신학적 해석, 적용, 교리 판단이 포함된 문장에는 반드시 출처 태그를 붙이세요.
- 허용 형식은 다음 둘 중 하나입니다: [기독교강요 p.123], [Inst.3.2.7]
- 출처 태그가 없는 단정 문장은 작성하지 마세요.
- 출처를 모르면 추측하지 말고 "출처 확인 필요"라고 명시하세요.
`.trim();

const CALVIN_PAGE_CITATION_REGEX = /\[기독교강요\s*p\.\s*\d+(?:\s*[-–]\s*\d+)?\]/;
const CALVIN_REF_CITATION_REGEX = /\[Inst\.\d+\.\d+\.\d+\]/i;

const hasCalvinCitation = (text: string): boolean => {
    return CALVIN_PAGE_CITATION_REGEX.test(text) || CALVIN_REF_CITATION_REGEX.test(text);
};

const isControlOrBootstrapMessage = (userMessage: string): boolean => {
    const normalized = userMessage.trim();
    if (!normalized) return true;
    if (normalized.startsWith('[시스템 액션]')) return true;
    if (normalized.includes('학습을 시작해주세요')) return true;
    if (normalized.includes('다음 단계')) return true;
    if (normalized.includes('강제 이동')) return true;
    return false;
};

const isQuestionOnlyTutorTurn = (text: string): boolean => {
    const cleaned = text.trim();
    if (!cleaned) return false;
    const questionMarks = (cleaned.match(/\?/g) || []).length;
    if (questionMarks === 0) return false;
    // 질문 위주의 턴(첫 진입/단계 진행)에서는 인용 강제를 하지 않는다.
    const hasDeclarativeEnding = /[.!]\s*$/.test(cleaned);
    return !hasDeclarativeEnding;
};

const requiresCalvinCitation = (processed: ProcessedResponse, userMessage: string): boolean => {
    if (isControlOrBootstrapMessage(userMessage)) return false;
    if (processed.quizStarted || processed.evaluationFeedback) return false;
    const cleaned = processed.cleanedText.trim();
    if (cleaned.length < 25) return false;
    if (isQuestionOnlyTutorTurn(cleaned)) return false;
    if (cleaned.startsWith('[NEXT_STEP:') || cleaned.startsWith('[START_TEST]') || cleaned.startsWith('[COMPLETE]')) return false;
    return true;
};

const inferStepFromText = (text: string): LearningStep | undefined => {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (!compact) return undefined;

    // Fallback for responses that forgot to include [NEXT_STEP:...]
    // but clearly announce a stage transition in natural language.
    const transitionCue = /(이제|다음|곧|바로|넘어가|전환|진행|시작)/;
    const hasTransitionCue = transitionCue.test(compact);

    const stepMatchers: Array<{ step: LearningStep; regex: RegExp }> = [
        { step: LearningStep.OBSERVATION, regex: /관찰\s*단계/ },
        { step: LearningStep.INTERPRETATION, regex: /해석\s*단계/ },
        { step: LearningStep.APPLICATION, regex: /적용\s*단계/ },
        { step: LearningStep.MEMORIZE_AND_TEST, regex: /(암송\s*\/\s*시험|암송\/시험)\s*단계|시험을\s*시작/ },
        { step: LearningStep.ANALYSIS, regex: /분석\s*단계/ },
        { step: LearningStep.UNDERSTANDING, regex: /이해\s*단계/ },
        { step: LearningStep.MEMORIZATION, regex: /암송\s*단계/ },
        { step: LearningStep.TEST, regex: /시험\s*단계|테스트\s*단계/ },
    ];

    for (const { step, regex } of stepMatchers) {
        if (regex.test(compact) && hasTransitionCue) {
            return step;
        }
    }

    return undefined;
};

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

        // --- BUG FIX: Extract verse first to make it available for quiz processing ---
        const verseMatch = cleanedText.match(/\[BIBLE_VERSE\]([\s\S]*?)\[\/BIBLE_VERSE\]/);
        let extractedVerse: string | null = null;
        if (verseMatch && verseMatch[1]) {
          extractedVerse = verseMatch[1].trim();
          if (extractedVerse) result.verseExtracted = extractedVerse;
          cleanedText = cleanedText.replace(verseMatch[0], '').trim();
        }
      
        const stepMatch = cleanedText.match(/\[NEXT_STEP:([\w_]+)\]/);
        if (stepMatch && stepMatch[1]) {
          const nextStepKey = stepMatch[1].toUpperCase() as keyof typeof LearningStep;
          const stepValue = LearningStep[nextStepKey];
          if (stepValue) result.stepChangedTo = stepValue;
          cleanedText = cleanedText.replace(stepMatch[0], '').trim();
        } else {
          const inferredStep = inferStepFromText(cleanedText);
          if (inferredStep) result.stepChangedTo = inferredStep;
        }
      
        const testMatchIndex = cleanedText.indexOf('[START_TEST]');
        if (testMatchIndex !== -1) {
          const textBeforeTag = cleanedText.substring(0, testMatchIndex).trim();
          const stringAfterTag = cleanedText.substring(testMatchIndex + '[START_TEST]'.length);
          
          // --- BUG FIX: Use the verse from state OR the one just extracted from this response ---
          const verseForQuiz = bibleVerse || extractedVerse;
          
          let quizJsonString = '';
          try {
            const jsonStartIndex = stringAfterTag.search(/[{\[]/);
            if (jsonStartIndex !== -1) {
              const textBetweenTagAndJson = stringAfterTag.substring(0, jsonStartIndex).trim();
              const displayText = [textBeforeTag, textBetweenTagAndJson].filter(Boolean).join('\n\n').trim();
              
              let rawJsonString = stringAfterTag.substring(jsonStartIndex);
              const lastBracket = rawJsonString.lastIndexOf(']');
              const lastBrace = rawJsonString.lastIndexOf('}');
              const jsonEndIndex = Math.max(lastBracket, lastBrace);
              quizJsonString = jsonEndIndex > -1 ? rawJsonString.substring(0, jsonEndIndex + 1) : rawJsonString;
      
              const parsedQuiz = JSON.parse(quizJsonString) as Quiz;
              
              if (parsedQuiz && parsedQuiz.questions) {
                  if (verseForQuiz) {
                      const sessionRef = parseReference(topic);
                      if (sessionRef) {
                          parsedQuiz.questions = parsedQuiz.questions.filter(q => {
                              const questionRef = parseReference(q.verseReference);
                              if (!questionRef || sessionRef.book !== questionRef.book || sessionRef.chapter !== questionRef.chapter) return false;
                              if (!questionRef.verses.every(v => sessionRef.verses.includes(v))) return false;
                              if (q.type === QuestionType.FILL_IN_THE_BLANK) {
                                  const verseStringFromParts = q.verseTextParts.join('').replace(/___/g, '');
                                  if (!normalizeText(verseForQuiz).includes(normalizeText(verseStringFromParts))) return false;
                              }
                              return true;
                          });
                      }
                  }
              }
      
              if (isValidQuiz(parsedQuiz, verseForQuiz, topic)) {
                  result.quizStarted = parsedQuiz;
                  cleanedText = displayText;
              } else {
                  console.warn("AI generated an invalid quiz. Generating fallback quiz.");
                  const fallbackQuiz = createFallbackQuiz(topic, verseForQuiz);
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
              const fallbackQuiz = createFallbackQuiz(topic, verseForQuiz);
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
            const fallbackQuiz = createFallbackQuiz(topic, verseForQuiz);
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
            const systemInstruction = `${buildSystemInstruction(topic, mode)}\n\n${CALVIN_CITATION_POLICY}`;
            let calvinContextBlock = '';
            if (!isControlOrBootstrapMessage(messageContent)) {
                const query = `${topic}\n${messageContent}`;
                const chunks = await searchCalvinChunks(query, 3);
                calvinContextBlock = buildCalvinContextBlock(chunks);
            }
            const messageForModel = calvinContextBlock
                ? `${messageContent}\n\n${calvinContextBlock}`
                : messageContent;

            const callModelWithMessage = async (messageForModel: string): Promise<string> => {
                // For Gemini, the system instruction is a separate parameter.
                if (aiModel === 'gemini') {
                    const finalApiMessage = constructEnforcedPrompt(messageForModel, topic, bibleVerse, options);
                    return continueGeminiConversation(chatHistory, finalApiMessage, topic, mode, CALVIN_CITATION_POLICY);
                }

                // For ChatGPT and Perplexity, the system instruction is the first message in the history.
                const historyForApi: ApiChatMessage[] = chatHistory.map((m): ApiChatMessage => {
                    switch (m.role) {
                        case 'model': return { role: 'assistant', content: m.content };
                        case 'user': return { role: 'user', content: m.content };
                        case 'system': return { role: 'system', content: m.content };
                    }
                });

                if (historyForApi.length === 0) {
                    historyForApi.unshift({ role: 'system', content: systemInstruction });
                }

                if (aiModel === 'perplexity') {
                    return continuePerplexityConversation(historyForApi, messageForModel);
                }
                // Align ChatGPT behavior with Gemini by applying the same passage-enforced/flexible wrapper.
                const finalApiMessage = constructEnforcedPrompt(messageForModel, topic, bibleVerse, options);
                return continueChatGptConversation(historyForApi, finalApiMessage);
            };

            let responseText = await callModelWithMessage(messageForModel);
            let processed = processAIResponse(responseText);

            if (requiresCalvinCitation(processed, messageContent) && !hasCalvinCitation(processed.cleanedText)) {
                const retryInstruction = [
                    "직전 답변을 다시 작성하세요.",
                    "모든 신학적 주장 문장 끝에 반드시 인용 태그를 붙이세요.",
                    "허용 형식: [기독교강요 p.123] 또는 [Inst.3.2.7]",
                    "출처를 모르면 '출처 확인 필요'로 명시하세요.",
                ].join('\n');

                responseText = await callModelWithMessage(`${messageForModel}\n\n${retryInstruction}`);
                processed = processAIResponse(responseText);

                if (requiresCalvinCitation(processed, messageContent) && !hasCalvinCitation(processed.cleanedText)) {
                    throw new Error("AI 응답에 기독교 강요 인용 태그가 없어 표시하지 않았습니다. 다시 시도해 주세요.");
                }
            }

            const newModelMessage: ChatMessage = { role: 'model', content: responseText };
            
            // For ChatGPT/Perplexity, add the system prompt to the persisted history on the first turn
            if (chatHistory.length === 0 && (aiModel === 'chatgpt' || aiModel === 'perplexity')) {
                 // FIX: Removed `as any` assertion. The `ChatMessage` type in `types.ts` has been updated
                 // to include the 'system' role, making this type-safe.
                 setChatHistory([{ role: 'system', content: systemInstruction }, newUserMessage, newModelMessage]);
            } else {
                 setChatHistory(prev => [...prev, newUserMessage, newModelMessage]);
            }
            
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
