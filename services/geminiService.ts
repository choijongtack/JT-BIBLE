import type { ChatMessage } from '../types';
import { supabase } from './supabaseClient';
import { buildSystemInstruction } from './instructionTemplate';

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