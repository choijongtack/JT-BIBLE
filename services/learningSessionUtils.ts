import type { Quiz, FillInTheBlankQuestion } from '../types';
import { QuestionType } from '../types';
import { parseReference } from './bibleUtils';

/**
 * AI가 유효한 퀴즈를 생성하지 못했을 때 DB 기반의 대체 퀴즈를 생성합니다.
 * @param topic 현재 학습 주제 (예: "창세기 1:1-5")
 * @param bibleVerse DB에서 가져온 원본 성경 본문
 * @returns 생성된 Quiz 객체 또는 실패 시 null
 */
export const createFallbackQuiz = (topic: string, bibleVerse: string | null): Quiz | null => {
  if (!bibleVerse) return null;

  const parsedTopic = parseReference(topic);
  if (!parsedTopic) return null;

  const questions: FillInTheBlankQuestion[] = [];
  const lines = bibleVerse.trim().split('\n');

  for (const line of lines) {
    const lineMatch = line.match(/^(\d+:\d+)\s(.+)/s);
    if (!lineMatch) continue;

    const verseRefStr = lineMatch[1];
    const verseText = lineMatch[2].trim();

    const eligibleWords = verseText.split(/\s+/).filter(w => w.length >= 2 && !/[.,;?!:'"()]/.test(w));
    if (eligibleWords.length === 0) continue;

    const answer = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const answerIndex = verseText.indexOf(answer);
    if (answerIndex === -1) continue;

    const part1 = verseText.substring(0, answerIndex);
    const part2 = verseText.substring(answerIndex + answer.length);

    const question: FillInTheBlankQuestion = {
      type: QuestionType.FILL_IN_THE_BLANK,
      verseReference: `${parsedTopic.book} ${verseRefStr}`,
      verseTextParts: [part1, '___', part2],
      answers: [answer],
    };
    questions.push(question);
  }

  if (questions.length === 0) return null;

  return {
    topic: `${topic} (기본 퀴즈)`,
    questions,
  };
};

/**
 * AI에게 보내는 프롬프트에 현재 학습 중인 성경 본문 컨텍스트를 강제로 주입합니다.
 * @param userMessage 사용자의 원본 메시지
 * @param topic 현재 학습 주제
 * @param bibleVerse 현재 학습 중인 성경 본문
 * @param options.enforcePassageOnly AI가 현재 본문만 참조하도록 강제할지 여부
 * @returns AI에게 보낼 최종 프롬프트 문자열
 */
export const constructEnforcedPrompt = (
  userMessage: string,
  topic: string,
  bibleVerse: string | null,
  options: { enforcePassageOnly: boolean } = { enforcePassageOnly: true }
): string => {
  if (!bibleVerse) {
    return userMessage;
  }

  if (options.enforcePassageOnly) {
    // 엄격한 프롬프트 (시스템 주도 메시지용)
    return `
매우 중요한 규칙: 당신의 모든 답변, 질문, 퀴즈는 반드시 아래 제공된 성경 본문에만 근거해야 합니다.
다른 어떤 성경 구절도 절대로 참조하거나 인용해서는 안 됩니다. 이 규칙을 어기면 안 됩니다.

[현재 학습 본문: ${topic}]
---
${bibleVerse}
---

이제 위의 규칙과 본문을 바탕으로 다음 시스템 지시를 수행하세요:
"${userMessage}"
`.trim();
  } else {
    // 유연한 프롬프트 (사용자 질문용)
    return `
**응답 지침:**
1.  **주요 초점:** 사용자의 질문에 답할 때, 아래 제공된 [현재 학습 본문]을 핵심 근거로 삼으세요.
2.  **답변 확장:** 만약 질문에 답하기 위해 추가적인 맥락(다른 성경 구절, 역사적 배경, 신학적 설명 등)이 필요하다면, 자유롭게 당신의 지식을 활용하여 답변을 보충하세요.
3.  **연결고리 설명:** 외부 정보를 사용할 경우, 그것이 어떻게 [현재 학습 본문]의 내용과 연결되는지 반드시 설명하여 사용자의 이해를 도와주세요.

[현재 학습 본문: ${topic}]
---
${bibleVerse}
---

이제 위의 지침과 본문을 바탕으로 사용자의 다음 질문에 대해 깊이 있고 유용한 답변을 제공하세요:
"${userMessage}"
`.trim();
  }
};

/**
 * 문자열 비교를 위해 공백과 구두점을 제거하고 소문자로 변환합니다.
 * @param text 정규화할 문자열
 * @returns 정규화된 문자열
 */
export const normalizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/[\s.,;:?!'"`“‘”’]/g, '').toLowerCase();
};

/**
 * 사용자의 답변과 정답을 유연하게 비교합니다. 조사의 유무를 허용합니다.
 * @param userAnswer 사용자가 입력한 답변
 * @param correctAnswer 실제 정답
 * @returns 정답 여부 (boolean)
 */
export const isAnswerCorrect = (userAnswer: string, correctAnswer: string): boolean => {
    const userNorm = normalizeText(userAnswer);
    const correctNorm = normalizeText(correctAnswer);

    if (userNorm === correctNorm) {
        return true;
    }
    
    const shorter = userNorm.length < correctNorm.length ? userNorm : correctNorm;
    const longer = userNorm.length < correctNorm.length ? correctNorm : userNorm;

    if (shorter.length > 1 && longer.startsWith(shorter) && (longer.length - shorter.length <= 2)) {
        return true;
    }

    return false;
};
