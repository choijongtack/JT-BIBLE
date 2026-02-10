import type { ChatMessage } from '../types';
import { supabase } from './supabaseClient';
import { buildSystemInstruction } from './instructionTemplate';
import { BIBLE_METADATA } from './bibleData';

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
    // FIX: Filter out system messages. The Gemini API expects system instructions
    // to be passed in a separate `systemInstruction` parameter, not within the message history.
    return history.filter(msg => msg.role !== 'system').map(msg => ({
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

export const getNextStudyTopic = async (currentTopic: string, bookName: string): Promise<string> => {
    try {
        const bookMeta = BIBLE_METADATA[bookName];
        let prompt = `현재 학습 주제는 '${currentTopic}'입니다. 이 구절 바로 다음에 이어지는, 내용상 자연스럽게 구분되는 다음 단락(pericope)을 추천해주세요.`;

        if (bookMeta) {
            prompt += ` 참고로, '${bookName}'은 총 ${bookMeta.chapters}장으로 되어 있으며, 마지막 장은 ${bookMeta.versesInLastChapter}절까지 있습니다. 이 정보를 바탕으로 추천해주세요.`;
        }
        
        prompt += ` 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;

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

export const continueLearningConversation = async (currentHistory: ChatMessage[], message: string, topic: string, mode: 'general' | 'advanced'): Promise<string> => {
    try {
        const systemInstruction = buildSystemInstruction(topic, mode);
        const newUserMessage: ChatMessage = { role: 'user', content: message };
        
        const payload = {
            contents: toGeminiHistory([...currentHistory, newUserMessage]),
            systemInstruction: {
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

export const generatePrayerForTopic = async (topic: string, mode: 'general' | 'advanced'): Promise<string> => {
    try {
        const prompt = `
당신은 깊은 영성을 지닌 목회자이자 신학자입니다.
제시된 성경 주제("${topic}")의 핵심 메시지를 깊이 묵상하여, 사용자가 하나님께 감사하고 자신의 삶을 다짐하며 나아갈 수 있는 3~4 문장의 짧고 진실된 기도문을 작성해주세요.
학습 모드가 '${mode === 'advanced' ? '심화 학습' : '일반 학습'}'이었음을 고려하여 기도문의 톤을 조절해주세요:
- 심화 학습: 본문의 논리적 구조와 신학적 원리가 드러나는 지적인 성찰이 담긴 기도문.
- 일반 학습: 본문의 교훈을 실제 삶에 적용하고 감사하는 내용의 따뜻하고 실천적인 기도문.
다른 어떤 설명이나 인사말 없이, 오직 기도문 텍스트만을 반환해야 합니다.
`.trim();

        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        const prayer = await callGeminiProxy(payload);

        if (!prayer) {
            throw new Error('AI가 유효한 기도문을 반환하지 않았습니다.');
        }
        return prayer.trim();
    } catch (error) {
        console.error(`Error generating prayer for ${topic}:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`기도문을 생성하지 못했습니다: ${errorMessage}`);
    }
};

export const getCalvinInterpretationFromGemini = async (
    koreanQuestion: string,
    englishQuery: string,
    sourceChunks: { page_from: number; page_to: number; content: string }[],
    webSourcesText: string = ''
): Promise<string> => {
    const sourceBlock = sourceChunks
        .map((c, idx) => {
            const p = c.page_from === c.page_to ? `p.${c.page_from}` : `p.${c.page_from}-${c.page_to}`;
            return `[${idx + 1}] ${p}\n${c.content}`;
        })
        .join('\n\n');

    const prompt = [
        'You are a theology assistant.',
        'Use the provided Calvin Institutes excerpts as primary source and respond in Korean.',
        'Output exactly two sections with these headings:',
        '원본 내용:',
        '해석 내용:',
        '',
        `한국어 질문: ${koreanQuestion}`,
        `영어 검색 질의: ${englishQuery}`,
        '',
        '[Calvin source excerpts]',
        sourceBlock || '(no local source excerpts found)',
        '',
        '[Web interpretation sources]',
        webSourcesText || '(no web interpretation sources)',
    ].join('\n');

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };
    const content = await callGeminiProxy(payload);
    if (!content?.trim()) {
        throw new Error('Gemini interpretation response was empty.');
    }
    return content.trim();
};
