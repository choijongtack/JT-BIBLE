import type { ChatMessage } from '../types';
import { supabase } from './supabaseClient';
import { buildSystemInstruction } from './instructionTemplate';
import { BIBLE_METADATA } from './bibleData';

const PROXY_FUNCTION_NAME = 'gemini-proxy';
const PREFERRED_GEMINI_MODEL_KEY = 'jt-bible-gemini-model';

export const GEMINI_ALLOWED_MODELS = [
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
] as const;

const DEFAULT_GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-3.6-flash';
const GEMINI_FALLBACK_MODELS = GEMINI_ALLOWED_MODELS.map(model => model.value);

type GeminiModel = typeof GEMINI_ALLOWED_MODELS[number]['value'];

const isAllowedGeminiModel = (model: string): model is GeminiModel =>
    GEMINI_ALLOWED_MODELS.some(option => option.value === model);

export const setPreferredGeminiModel = (model: string) => {
    const nextModel = model?.trim();
    if (!nextModel || !isAllowedGeminiModel(nextModel)) return;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(PREFERRED_GEMINI_MODEL_KEY, nextModel);
    }
};

export const getGeminiModel = (): GeminiModel => {
    if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(PREFERRED_GEMINI_MODEL_KEY);
        const normalizedStored = stored?.trim();
        if (normalizedStored && isAllowedGeminiModel(normalizedStored)) {
            return normalizedStored;
        }
    }
    if (DEFAULT_GEMINI_MODEL && isAllowedGeminiModel(DEFAULT_GEMINI_MODEL)) {
        return DEFAULT_GEMINI_MODEL;
    }
    return 'gemini-3.6-flash';
};

export const getGeminiModelDisplayName = (model = getGeminiModel()) =>
    GEMINI_ALLOWED_MODELS.find(option => option.value === model)?.label || model;

const getModelCandidateList = (preferred: string) => {
    const pref = preferred?.trim();
    const candidates = [pref, ...GEMINI_FALLBACK_MODELS];
    return Array.from(new Set(candidates.filter((item): item is GeminiModel => Boolean(item) && isAllowedGeminiModel(item))));
};

/**
 * Calls the Supabase Edge Function which securely proxies the request to the Gemini API.
 * @param payload The request body to be sent to the Gemini API.
 * @returns The text content from the Gemini API response.
 */
const callGeminiProxy = async (payload: object): Promise<string> => {
    let lastError: Error | null = null;
    for (const model of getModelCandidateList(getGeminiModel())) {
        const { data, error } = await supabase.functions.invoke(PROXY_FUNCTION_NAME, {
            body: { payload, model },
        });

        if (error) {
            console.error("Supabase function invocation error:", error);
            throw new Error(`프록시 함수 호출에 실패했습니다: ${error.message}`);
        }

        if (data.error) {
            const originalMessage = data.error.message || 'Gemini API 오류가 발생했습니다.';
            const lowerMessage = originalMessage.toLowerCase();
            const modelFailure = lowerMessage.includes('model') && (
                lowerMessage.includes('not found') ||
                lowerMessage.includes('does not exist') ||
                lowerMessage.includes('unavailable') ||
                lowerMessage.includes('invalid') ||
                lowerMessage.includes('deprecated')
            );
            lastError = new Error(`Gemini API 오류: ${originalMessage}`);
            if (modelFailure) {
                console.warn(`Gemini 모델 '${model}'에서 실패했습니다. 다음 후보 모델을 시도합니다.`, originalMessage);
                continue;
            }
            console.error("Gemini API Error:", data.error);
            throw lastError;
        }

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            console.error("Invalid response structure from Gemini API:", data);
            if (data.promptFeedback?.blockReason) {
                 throw new Error(`요청이 Gemini의 안전 설정에 의해 차단되었습니다. 이유: ${data.promptFeedback.blockReason}`);
            }
            throw new Error('Gemini API로부터 유효한 텍스트 응답을 받지 못했습니다.');
        }

        return data.candidates[0].content.parts[0].text;
    }

    throw lastError || new Error('Gemini 모델 요청에 실패했습니다. 모델 설정을 확인해주세요.');
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

export const continueLearningConversation = async (
    currentHistory: ChatMessage[],
    message: string,
    topic: string,
    mode: 'general' | 'advanced',
    extraSystemInstruction?: string
): Promise<string> => {
    try {
        const baseSystemInstruction = buildSystemInstruction(topic, mode);
        const systemInstruction = extraSystemInstruction?.trim()
            ? `${baseSystemInstruction}\n\n${extraSystemInstruction.trim()}`
            : baseSystemInstruction;
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
