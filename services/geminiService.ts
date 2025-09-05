import type { ChatMessage } from '../types';
import { supabase } from './supabaseClient';

const PROXY_FUNCTION_NAME = 'gemini-proxy';

/**
 * Calls the Supabase Edge Function which securely proxies the request to the Gemini API.
 * @param payload The request body to be sent to the Gemini API.
 * @returns The text content from the Gemini API response.
 */
const callGeminiProxy = async (payload: object): Promise<string> => {
    // FIX: Re-wrapped the body in a 'payload' object to align with the structure
    // used by other proxy functions (Perplexity, ChatGPT), ensuring consistency.
    const { data, error } = await supabase.functions.invoke(PROXY_FUNCTION_NAME, {
        body: { payload },
    });

    if (error) {
        console.error("Supabase function invocation error:", error);
        throw new Error(`프록시 함수 호출에 실패했습니다: ${error.message}`);
    }

    // The proxy returns the raw response from the Gemini API.
    // We need to handle potential errors from the Gemini API itself within the response data.
    if (data.error) {
        console.error("Gemini API Error:", data.error);
        throw new Error(`Gemini API 오류: ${data.error.message}`);
    }

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        console.error("Invalid response structure from Gemini API:", data);
        // Handle safety blocks or other non-standard responses
        if (data.promptFeedback?.blockReason) {
             throw new Error(`요청이 Gemini의 안전 설정에 의해 차단되었습니다. 이유: ${data.promptFeedback.blockReason}`);
        }
        throw new Error('Gemini API로부터 유효한 텍스트 응답을 받지 못했습니다.');
    }

    return data.candidates[0].content.parts[0].text;
};

const toGeminiHistory = (history: ChatMessage[]) => {
    return history.map(msg => ({
        // The REST API uses 'model' for the assistant's role.
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));
};


export const getStudyTopicForBook = async (book: string): Promise<string> => {
    try {
        const prompt = `당신은 전문 신학자이고 법률학자이며 로스쿨 교수입니다. 저는 '${book}'을(를) 공부하기 시작하려고 합니다. 이 책의 시작 부분(1장 1절부터)을 분석하여, 첫 학습 세션에 적합한, 내용상 자연스럽게 구분되는 첫 번째 단락(pericope)을 추천해주세요. 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 예를 들어, '에베소서'를 선택했다면 '에베소서 1:1-2' 또는 '에베소서 1:1-14'와 같이 제안할 수 있습니다. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        const topic = await callGeminiProxy(payload);

        if (!topic || !topic.includes(':')) {
            throw new Error('AI가 유효한 주제를 반환하지 않았습니다.');
        }
        return topic.trim();
    } catch (error) {
        console.error(`Error getting study topic for ${book}:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`학습 주제를 가져오지 못했습니다: ${errorMessage}`);
    }
};

export const getNextStudyTopic = async (currentTopic: string): Promise<string> => {
    try {
        const prompt = `현재 학습 주제는 '${currentTopic}'입니다. 이 구절 바로 다음에 이어지는, 내용상 자연스럽게 구분되는 다음 단락(pericope)을 추천해주세요. 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        const topic = await callGeminiProxy(payload);

        if (!topic || !topic.includes(':')) {
            throw new Error('AI가 유효한 다음 주제를 반환하지 않았습니다.');
        }
        return topic.trim();
    } catch (error) {
        console.error(`Error getting next study topic after ${currentTopic}:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`다음 학습 주제를 가져오지 못했습니다: ${errorMessage}`);
    }
};

export const getSystemInstruction = (topic: string) => {
// FIX: Escaped backticks used for markdown-style code blocks within the template literal.
    return `당신은 전문 신학자이자 개인 성경 공부 튜터입니다.
당신의 교육 방식은 변호사 시험을 공부하는 방식에서 영감을 받았습니다: 분석적이고, 구조적이며, 핵심 원칙에 집중합니다.
당신의 목표는 대화형 소크라테스식 문답법을 사용하여 사용자가 성경을 학습하도록 돕는 것입니다.

**첫 번째 임무:**
대화를 시작하기 전에, 먼저 '${topic}'에 해당하는 전체 성경 본문을 제공해야 합니다. 성경 본문은 반드시 '개역개정판'을 사용해야 합니다. 본문은 반드시 \\\`[BIBLE_VERSE]\\\`와 \\\`[/BIBLE_VERSE]\\\` 태그로 감싸야 합니다. 이 태그 다음 줄부터 사용자에게 환영 인사를 건네고 첫 번째 학습 단계를 시작하세요.

**4가지 학습 단계:**
당신은 사용자를 다음 4가지 학습 단계를 정확한 순서대로 이끌 것입니다:
1. 분석(ANALYSIS): 성구의 구조, 핵심 단어, 논리적 흐름을 분해합니다.
2. 이해(UNDERSTANDING): 신학적 의미, 역사적 맥락, 핵심 교리를 설명합니다.
3. 암송(MEMORIZATION): 빈칸 채우기나 핵심 단어 연상 같은 기술을 통해 사용자가 핵심 구절을 암기하도록 돕습니다.
4. 시험(TEST): 사용자의 이해와 암기 상태를 확인하기 위해 퀴즈를 냅니다.

**당신의 진행 방식:**
- 4단계 진행을 당신이 관리합니다.
- 한 번에 하나의 질문만 하세요. 설명은 간결하고 이해하기 쉽게 유지하세요. 한번에 너무 많은 텍스트를 제공하지 마세요.
- 사용자의 답변을 기다리세요.
- 답변을 평가하세요. 사용자가 이해했다면 칭찬하고 다음 질문이나 개념으로 넘어가세요. 어려워한다면 정답을 부드럽게 안내해주세요.
- **수동 제어:** 사용자가 "[사용자 액션] '단계 이름' 단계로 강제 이동합니다."와 같은 특별한 메시지를 보낼 수 있습니다. 이 메시지를 받으면, 즉시 현재 진행 중인 대화를 중단하고 지정된 새로운 학습 단계를 시작해야 합니다. 이것은 사용자가 학습 속도를 직접 제어할 수 있도록 하는 기능입니다.
- **중요:** 사용자가 한 단계를 완전히 숙달했다고 확신할 때만 다음 단계로 넘어갑니다.
- **단계 전환을 애플리케이션에 알리기 위해, 당신의 응답에 반드시 마커를 포함해야 합니다. 형식은 \\\`[NEXT_STEP:STEP_NAME_IN_ENGLISH]\\\` 입니다. 예: \\\`[NEXT_STEP:UNDERSTANDING]\\\` 또는 \\\`[NEXT_STEP:MEMORIZATION]\\\`.**
- 마지막 '시험' 단계가 되면, 먼저 시험을 시작한다고 말한 다음, 반드시 \\\`[START_TEST]\\\` 마커와 함께 퀴즈용 JSON 객체를 즉시 출력해야 합니다.
- JSON 객체는 다음 스키마를 정확히 따라야 합니다: { "topic": "string", "questions": [ { "type": "FILL_IN_THE_BLANK", "verseReference": "string", "verseTextParts": ["string", "___", "string", "___", "string"], "answers": ["string", "string"] }, ... (총 5문제) ] }
- **빈칸 채우기(FILL_IN_THE_BLANK) 문제의 경우, 구절의 암송에 도움이 되도록 맥락상 중요한 핵심 단어 **두 개**를 빈칸으로 만드세요. 따라서 \\\`verseTextParts\\\` 배열에는 '___'가 두 개 있어야 하고, \\\`answers\\\` 배열에는 해당 빈칸에 대한 정답 두 개가 순서대로 포함되어야 합니다.**
- 텍스트 응답에 마크다운을 사용하지 마세요.
- 대화 내내 친절하고, 격려하며, 학구적인 톤을 유지하세요.
- 학습과정에 신학적 판단은 존 칼뱅의 기독교 강요를 기본 근거로 진행해 주세요. 
`;
};

export const startLearningConversation = async (topic: string, history: ChatMessage[] = []): Promise<{ history: ChatMessage[]; initialMessage?: string }> => {
    try {
        if (history.length > 0) {
            return { history };
        }

        const systemInstruction = getSystemInstruction(topic);
        const initialUserMessage: ChatMessage = { role: 'user', content: "학습을 시작해주세요." };

        const payload = {
            contents: toGeminiHistory([initialUserMessage]),
            system_instruction: { // Gemini REST API uses 'system_instruction' with an underscore
                parts: [{ text: systemInstruction }]
            }
        };

        const initialMessage = await callGeminiProxy(payload);
        const newHistory: ChatMessage[] = [
            initialUserMessage,
            { role: 'model', content: initialMessage }
        ];

        return { history: newHistory, initialMessage };

    } catch (error) {
        console.error("Error starting conversation with Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`대화를 시작하지 못했습니다: ${errorMessage}`);
    }
};

export const continueLearningConversation = async (currentHistory: ChatMessage[], message: string): Promise<string> => {
    try {
        // Topic is implicitly part of the system instruction from the start of the conversation.
        const systemInstruction = getSystemInstruction('');
        const newUserMessage: ChatMessage = { role: 'user', content: message };
        
        const payload = {
            contents: toGeminiHistory([...currentHistory, newUserMessage]),
            system_instruction: {
                parts: [{ text: systemInstruction }]
            }
        };

        return await callGeminiProxy(payload);
    } catch (error) {
        console.error("Error continuing conversation with Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`대화를 이어가지 못했습니다: ${errorMessage}`);
    }
};