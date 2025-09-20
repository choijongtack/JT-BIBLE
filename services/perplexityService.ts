import type { ChatMessage } from '../types';
import { supabase } from './supabaseClient';
import { buildSystemInstruction } from './instructionTemplate';
import { BIBLE_METADATA } from './bibleData';

const PPLX_MODEL = 'llama-3-sonar-small-32k-online';
const PROXY_FUNCTION_NAME = 'perplexity-proxy';
const API_ENDPOINT = 'chat/completions';

/**
 * A helper function to parse and return a detailed error from a failed proxy API response.
 * @param functionError The error object from supabase.functions.invoke.
 * @param data The data object from the function response, which may contain a proxied error.
 * @param context A string describing the context of the call for better logging.
 * @returns An object containing the formatted error message string.
 */
const handleProxyError = (functionError: Error | null, data: any, context: string): { error: string } => {
    let errorMessage: string;
    if (functionError) {
        errorMessage = functionError.message;
    } else if (data?.error?.message) {
        errorMessage = data.error.message;
    } else if (data?.detail) {
        // Perplexity-specific error format
        if (typeof data.detail === 'string') {
            errorMessage = data.detail;
        } else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
            errorMessage = data.detail.map((d: any) => d.msg).join(', ');
        } else {
            errorMessage = JSON.stringify(data);
        }
    } else {
        errorMessage = `알 수 없는 오류가 발생했습니다: ${JSON.stringify(data)}`;
    }
    console.error(`Perplexity proxy call failed (${context}):`, errorMessage);
    return { error: errorMessage };
}

export const testPerplexityApiKey = async (apiKey: string): Promise<{ isValid: boolean; error?: string }> => {
    if (!apiKey) return { isValid: false, error: 'API 키가 제공되지 않았습니다.' };
    try {
        const payload = {
            apiKey,
            endpoint: API_ENDPOINT,
            payload: {
                model: PPLX_MODEL,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 5,
            }
        };
        const { data, error: functionError } = await supabase.functions.invoke(PROXY_FUNCTION_NAME, {
            body: { payload }
        });

        if (functionError || data.error || data.detail) {
            return { isValid: false, ...handleProxyError(functionError, data, 'API key test') };
        }
        
        return { isValid: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 네트워크 오류';
        console.error('Perplexity API key test failed:', error);
        return { isValid: false, error: errorMessage };
    }
};

export const getStudyTopicForBook = async (book: string, apiKey: string): Promise<string> => {
    const prompt = `당신은 전문 신학자이고 법률학자이며 로스쿨 교수입니다. 저는 '${book}'을(를) 공부하기 시작하려고 합니다. 이 책의 시작 부분(1장 1절부터)을 분석하여, 첫 학습 세션에 적합한, 내용상 자연스럽게 구분되는 첫 번째 단락(pericope)을 추천해주세요. 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 예를 들어, '에베소서'를 선택했다면 '에베소서 1:1-2' 또는 '에베소서 1:1-14'와 같이 제안할 수 있습니다. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;
    
    try {
        const payload = {
            apiKey,
            endpoint: API_ENDPOINT,
            payload: {
                model: PPLX_MODEL,
                messages: [{ role: 'system', content: "You are a helpful assistant." }, { role: 'user', content: prompt }],
            }
        };
        const { data, error: functionError } = await supabase.functions.invoke(PROXY_FUNCTION_NAME, {
            body: { payload }
        });
        
        if (functionError || data.error || data.detail) {
            const { error } = handleProxyError(functionError, data, 'get study topic');
            throw new Error(error);
        }

        const topic = data.choices[0].message.content.trim();
        if (!topic || !topic.includes(':')) {
            throw new Error('AI가 유효한 주제를 반환하지 않았습니다.');
        }
        return topic;

    } catch (error) {
        console.error(`Error getting study topic for ${book} from Perplexity:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`학습 주제를 가져오지 못했습니다: ${errorMessage}`);
    }
};

export const getNextStudyTopic = async (currentTopic: string, apiKey: string, bookName: string): Promise<string> => {
    const bookMeta = BIBLE_METADATA[bookName];
    let prompt = `현재 학습 주제는 '${currentTopic}'입니다. 이 구절 바로 다음에 이어지는, 내용상 자연스럽게 구분되는 다음 단락(pericope)을 추천해주세요.`;

    if (bookMeta) {
        prompt += ` 참고로, '${bookName}'은 총 ${bookMeta.chapters}장으로 되어 있으며, 마지막 장은 ${bookMeta.versesInLastChapter}절까지 있습니다. 이 정보를 바탕으로 추천해주세요.`;
    }
    
    prompt += ` 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;

    try {
        const payload = {
            apiKey,
            endpoint: API_ENDPOINT,
            payload: {
                model: PPLX_MODEL,
                messages: [{ role: 'system', content: "You are a helpful assistant." }, { role: 'user', content: prompt }],
            }
        };
        const { data, error: functionError } = await supabase.functions.invoke(PROXY_FUNCTION_NAME, {
            body: { payload }
        });

        if (functionError || data.error || data.detail) {
            const { error } = handleProxyError(functionError, data, 'get next study topic');
            throw new Error(error);
        }

        const topic = data.choices[0].message.content.trim();
        if (!topic || !topic.includes(':')) {
            throw new Error('AI가 유효한 다음 주제를 반환하지 않았습니다.');
        }
        return topic;
    } catch (error) {
        console.error(`Error getting next study topic after ${currentTopic} from Perplexity:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`다음 학습 주제를 가져오지 못했습니다: ${errorMessage}`);
    }
};

const buildHistory = (systemInstruction: string, existingMessages: ChatMessage[]): {role: 'system' | 'user' | 'assistant'; content: string}[] => {
    const history: {role: 'system' | 'user' | 'assistant'; content: string}[] = [{ role: 'system', content: systemInstruction }];
    existingMessages.forEach(msg => history.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content }));
    return history;
}

export const continueLearningConversation = async (currentHistory: ChatMessage[], message: string, topic: string, mode: 'general' | 'advanced', apiKey: string): Promise<string> => {
    try {
        const systemInstruction = buildSystemInstruction(topic, mode);
        const messages = buildHistory(systemInstruction, currentHistory);
        messages.push({ role: 'user', content: message });
        
        const payload = {
            apiKey,
            endpoint: API_ENDPOINT,
            payload: { model: PPLX_MODEL, messages }
        };
        const { data, error: functionError } = await supabase.functions.invoke(PROXY_FUNCTION_NAME, {
            body: { payload }
        });

        if (functionError || data.error || data.detail) {
            const { error } = handleProxyError(functionError, data, 'continue conversation');
            throw new Error(error);
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Error continuing conversation with Perplexity:", error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`대화를 이어가지 못했습니다: ${errorMessage}`);
    }
};