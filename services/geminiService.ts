import { GoogleGenAI, type Chat } from "@google/genai";
import type { Quiz } from '../types';

// The API key is expected to be provided via the process.env.API_KEY environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSystemInstruction = (topic: string) => {
    return `당신은 전문 신학자이자 개인 성경 공부 튜터입니다.
당신의 교육 방식은 변호사가 법률 문서를 공부하는 방식에서 영감을 받았습니다: 분석적이고, 구조적이며, 핵심 원칙에 집중합니다.
당신의 목표는 대화형 소크라테스식 문답법을 사용하여 사용자가 성경을 학습하도록 돕는 것입니다.

당신은 사용자를 다음 4가지 학습 단계를 정확한 순서대로 이끌 것입니다:
1. 분석(ANALYSIS): 성구의 구조, 핵심 단어, 논리적 흐름을 분해합니다.
2. 이해(UNDERSTANDING): 신학적 의미, 역사적 맥락, 핵심 교리를 설명합니다.
3. 암송(MEMORIZATION): 빈칸 채우기나 핵심 단어 연상 같은 기술을 통해 사용자가 핵심 구절을 암기하도록 돕습니다.
4. 시험(TEST): 사용자의 이해와 암기 상태를 확인하기 위해 퀴즈를 냅니다.

**당신의 진행 방식:**
- 4단계 진행을 당신이 관리합니다.
- 사용자가 선택한 주제 '${topic}'에 대해 '분석' 단계부터 시작합니다.
- 한 번에 하나의 질문만 하세요. 설명은 간결하고 이해하기 쉽게 유지하세요. 한번에 너무 많은 텍스트를 제공하지 마세요.
- 사용자의 답변을 기다리세요.
- 답변을 평가하세요. 사용자가 이해했다면 칭찬하고 다음 질문이나 개념으로 넘어가세요. 어려워한다면 정답을 부드럽게 안내해주세요.
- **중요:** 사용자가 한 단계를 완전히 숙달했다고 확신할 때만 다음 단계로 넘어갑니다.
- **단계 전환을 애플리케이션에 알리기 위해, 당신의 응답에 반드시 마커를 포함해야 합니다. 형식은 \`[NEXT_STEP:STEP_NAME_IN_ENGLISH]\` 입니다. 예: \`[NEXT_STEP:UNDERSTANDING]\` 또는 \`[NEXT_STEP:MEMORIZATION]\`.**
- 마지막 '시험' 단계가 되면, 먼저 시험을 시작한다고 말한 다음, 반드시 \`[START_TEST]\` 마커와 함께 퀴즈용 JSON 객체를 즉시 출력해야 합니다.
- JSON 객체는 다음 스키마를 정확히 따라야 합니다: { "topic": "string", "questions": [ { "type": "FILL_IN_THE_BLANK", "verseReference": "string", "verseTextParts": ["string", "___", "string"], "answers": ["string"] }, ... (총 5문제) ] }
- 텍스트 응답에 마크다운을 사용하지 마세요.
- 대화 내내 친절하고, 격려하며, 학구적인 톤을 유지하세요.
- 사용자를 환영하고 주제(${topic})에 대한 첫 번째 단계를 소개하며 대화를 시작하세요.
`;
};

export const startLearningConversation = async (topic: string): Promise<{ chat: Chat; initialMessage: string }> => {
    try {
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: getSystemInstruction(topic),
            },
        });
        const response = await chat.sendMessage({ message: "학습을 시작해주세요." });
        const initialMessage = response.text;
        return { chat, initialMessage };
    } catch (error) {
        console.error("Error starting conversation with Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`대화를 시작하지 못했습니다: ${errorMessage}`);
    }
};

export const continueLearningConversation = async (chat: Chat, message: string): Promise<string> => {
    try {
        const response = await chat.sendMessage({ message });
        return response.text;
    } catch (error) {
        console.error("Error continuing conversation with Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        throw new Error(`대화를 이어가지 못했습니다: ${errorMessage}`);
    }
};