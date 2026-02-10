import type { ChatMessage } from '../types';
import { supabase, supabaseUrl } from './supabaseClient';
import { buildSystemInstruction } from './instructionTemplate';
import { BIBLE_METADATA } from './bibleData';

const GPT_MODEL = 'gpt-4o';
// 함수 URL은 내보낸 supabaseUrl을 사용하여 동적으로 구성됩니다.
const PROXY_URL = `${supabaseUrl}/functions/v1/chatgpt-proxy`;

/**
 * Gets the authorization headers required for calling the Supabase function.
 * @returns A promise that resolves to the HeadersInit object.
 */
const getAuthHeaders = async (): Promise<HeadersInit> => {
    // FIX: Switched to supabase.auth.getSession() which is the correct method in Supabase JS v2.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('User not authenticated.');
    return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
    };
};

/**
 * A generic helper function to call the ChatGPT completion proxy.
 * It sends the full payload required by the OpenAI API.
 * The backend proxy is expected to forward this payload.
 * @param payload The request body to be sent to the OpenAI API.
 * @returns The JSON response from the API.
 */
const callChatGptCompletion = async (payload: object): Promise<any> => {
    let response: Response;
    try {
        const headers = await getAuthHeaders();
        response = await fetch(`${PROXY_URL}/chatgpt-completion`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
    } catch (e) {
        if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
            throw new Error('네트워크 오류: ChatGPT 서비스에 연결할 수 없습니다. 인터넷 연결 상태를 확인하거나, 잠시 후 다시 시도해 주세요.');
        }
        throw e;
    }

    let data;
    try {
        data = await response.json();
    } catch {
        const errorText = await response.text();
        throw new Error(`ChatGPT 프록시 오류: ${response.status} ${response.statusText}. 세부 정보: ${errorText.substring(0, 200)}`);
    }

    if (!response.ok || data.error) {
        const originalMessage = data.error?.message || 'ChatGPT 프록시에서 응답을 가져오는 데 실패했습니다.';
        
        if (originalMessage.toLowerCase().includes('quota')) {
            throw new Error(`OpenAI 사용량 한도를 초과했습니다. OpenAI 대시보드의 '결제(Billing)' 섹션에서 플랜 및 결제 세부 정보를 확인해주세요. 이 오류는 일반적으로 무료 크레딧을 모두 사용했거나 설정된 사용 한도에 도달했을 때 발생합니다.`);
        }
        
        if (originalMessage.toLowerCase().includes('incorrect api key') || originalMessage.toLowerCase().includes('invalid authentication')) {
            throw new Error(`저장된 OpenAI API 키가 잘못되었습니다. 메인 화면으로 돌아가 '수정' 버튼을 눌러 올바른 API 키를 다시 저장해주세요.`);
        }
        
        throw new Error(originalMessage);
    }
    return data;
};

/**
 * Saves the user's ChatGPT API key by sending it to a secure Supabase Edge Function.
 * The function is responsible for encrypting the key before storing it.
 * @param apiKey The user's plaintext ChatGPT API key.
 */
export const saveChatGptApiKey = async (apiKey: string): Promise<void> => {
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('유효한 API 키를 입력해야 합니다.');
    }
    
    let response: Response;
    try {
        const headers = await getAuthHeaders();
        response = await fetch(`${PROXY_URL}/save-chatgpt-key`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ apiKey: apiKey.trim() })
        });
    } catch (e) {
        if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
            throw new Error('네트워크 오류: API 키 저장 서버에 연결할 수 없습니다. 인터넷 연결 상태를 확인하거나, 잠시 후 다시 시도해 주세요.');
        }
        throw e;
    }

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            const errorText = await response.text();
            throw new Error(`API 키 저장에 실패했습니다. 서버 응답: ${response.status} ${response.statusText}. 세부 정보: ${errorText.substring(0, 100)}`);
        }
        throw new Error(errorData.error?.message || 'API 키를 저장하는 데 실패했습니다.');
    }
};


export const getStudyTopicForBook = async (book: string): Promise<string> => {
    const prompt = `당신은 전문 신학자이고 법률학자이며 로스쿨 교수입니다. 저는 '${book}'을(를) 공부하기 시작하려고 합니다. 이 책의 시작 부분(1장 1절부터)을 분석하여, 첫 학습 세션에 적합한, 내용상 자연스럽게 구분되는 첫 번째 단락(pericope)을 추천해주세요. 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 예를 들어, '에베소서'를 선택했다면 '에베소서 1:1-2' 또는 '에베소서 1:1-14'와 같이 제안할 수 있습니다. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;
    
    try {
        const data = await callChatGptCompletion({
            model: GPT_MODEL,
            messages: [{ role: 'system', content: "You are a helpful assistant." }, { role: 'user', content: prompt }],
        });
        const topic = data.choices[0].message.content.trim();
        if (!topic || !topic.includes(':')) {
            throw new Error('AI가 유효한 주제를 반환하지 않았습니다.');
        }
        return topic;

    } catch (error) {
        console.error(`Error getting study topic for ${book} from ChatGPT:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`학습 주제를 가져오지 못했습니다: ${errorMessage}`);
    }
};

export const getNextStudyTopic = async (currentTopic: string, bookName: string): Promise<string> => {
    const bookMeta = BIBLE_METADATA[bookName];
    let prompt = `현재 학습 주제는 '${currentTopic}'입니다. 이 구절 바로 다음에 이어지는, 내용상 자연스럽게 구분되는 다음 단락(pericope)을 추천해주세요.`;

    if (bookMeta) {
        prompt += ` 참고로, '${bookName}'은 총 ${bookMeta.chapters}장으로 되어 있으며, 마지막 장은 ${bookMeta.versesInLastChapter}절까지 있습니다. 이 정보를 바탕으로 추천해주세요.`;
    }
    
    prompt += ` 응답은 오직 '성경책 이름 장:절-절' 형식으로만 제공해주세요. 다른 어떤 설명이나 텍스트도 추가하지 마세요.`;

    try {
        const data = await callChatGptCompletion({
             model: GPT_MODEL,
             messages: [{ role: 'system', content: "You are a helpful assistant." }, { role: 'user', content: prompt }],
        });

        const topic = data.choices[0].message.content.trim();
        if (!topic || !topic.includes(':')) {
            throw new Error('AI가 유효한 다음 주제를 반환하지 않았습니다.');
        }
        return topic;
    } catch (error) {
        console.error(`Error getting next study topic after ${currentTopic} from ChatGPT:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`다음 학습 주제를 가져오지 못했습니다: ${errorMessage}`);
    }
};

export const continueLearningConversation = async (
    currentHistory: {role: 'system' | 'user' | 'assistant'; content: string}[], 
    message: string
): Promise<string> => {
    try {
        const messagesWithNew = [...currentHistory, { role: 'user' as const, content: message }];
        
        const data = await callChatGptCompletion({ model: GPT_MODEL, messages: messagesWithNew });

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Error continuing conversation with ChatGPT:", error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`대화를 이어가지 못했습니다: ${errorMessage}`);
    }
};

export const generatePrayerForTopic = async (topic: string, mode: 'general' | 'advanced'): Promise<string> => {
    const prompt = `
당신은 깊은 영성을 지닌 목회자이자 신학자입니다.
제시된 성경 주제("${topic}")의 핵심 메시지를 깊이 묵상하여, 사용자가 하나님께 감사하고 자신의 삶을 다짐하며 나아갈 수 있는 3~4 문장의 짧고 진실된 기도문을 작성해주세요.
학습 모드가 '${mode === 'advanced' ? '심화 학습' : '일반 학습'}'이었음을 고려하여 기도문의 톤을 조절해주세요:
- 심화 학습: 본문의 논리적 구조와 신학적 원리가 드러나는 지적인 성찰이 담긴 기도문.
- 일반 학습: 본문의 교훈을 실제 삶에 적용하고 감사하는 내용의 따뜻하고 실천적인 기도문.
다른 어떤 설명이나 인사말 없이, 오직 기도문 텍스트만을 반환해야 합니다.
`.trim();
    
    try {
        const data = await callChatGptCompletion({
            model: GPT_MODEL,
            messages: [{ role: 'system', content: "You are a helpful assistant." }, { role: 'user', content: prompt }],
        });
        const prayer = data.choices[0].message.content.trim();
        if (!prayer) {
            throw new Error('AI가 유효한 기도문을 반환하지 않았습니다.');
        }
        return prayer;

    } catch (error) {
        console.error(`Error generating prayer for ${topic} from ChatGPT:`, error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`기도문을 생성하지 못했습니다: ${errorMessage}`);
    }
};

export const getCalvinInterpretationFromChatGpt = async (
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

    const data = await callChatGptCompletion({
        model: GPT_MODEL,
        messages: [
            { role: 'system', content: 'You are a precise theological assistant.' },
            { role: 'user', content: prompt },
        ],
    });

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
        throw new Error('ChatGPT interpretation response was empty.');
    }
    return content;
};
