import type { Quiz, FillInTheBlankQuestion } from '../types';
import { QuestionType } from '../types';
import { parseReference } from './bibleUtils';

// Heuristics-based Fallback Quiz Generation
// This version aims to select more meaningful words for blanks compared to pure random selection.

const stripPunctuation = (word: string) =>
    word.replace(/[.,;?!:'"()\[\]{}—–\-]/g, ''); // '-' 추가 및 기타 특수문자 정리

// 문장 성분에 영향을 주지 않는 조사, 연결어미, 보조사, 감탄사 등
const KOREAN_STOP_WORDS: string[] = [
    // 격 조사
    '이', '가', '을', '를', '은', '는', '도', '만', '께서', '에서', '에게', '와', '과', '의', 
    
    // 접속 부사/관형사/보조사
    '그리고', '그러나', '그러므로', '하지만', '또는', '즉', '따라서', '혹은', '및', '또', '저', '그', '이', '것', 
    
    // 감탄사, 기타 불용어
    '아', '휴', '어', '저런', '에이', '예', '네', '아니', '뭐', '좀', '좀더', '다시', '계속', '바로', 
    
    // 시간 및 수량 표현 (맥락에 따라 불용어 아닐 수 있음, 일반적인 경우 필터링)
    '현재', '또한', '역시', '매우', '가장', '더', '덜', '무엇', '어떤', '모든', '각', '약', '몇', 
    
    // ~이다, ~하다의 어간
    '이다', '하다',
];

// 동사/형용사 어미, 문장 종결 및 연결 어미 (조사/어미 결합 형태 포함)
const VERB_OR_PARTICLE_ENDINGS: string[] = [
    // 종결 어미 및 연결 어미
    '다', '까', '나', '요', '지', '네', '고', '면', '며', '서', '지만', '으니', '으나', '건만', '으나마',
    
    // ~했다, ~하는
    '했', '하는', '한', '할', '하게', '하도록', '하여', '하여야', '하는지', 
    
    // 피동/사동 접미사 (문장에 따라 명사가 될 수 있어 주의 필요)
    '되', '시키', '받', '드리', 
    
    // 경어/의문/평서
    '습니다', 'ㅂ니다', '어요', '았어요', '였어요', 'ㄹ까요', '습니까', 'ㅂ니까', '었', '았', 'ㄹ', '게', '자',
    
    // 부사격 조사 및 연결
    '으로', '로써', '으로써', '부터', '까지', '처럼', '만큼', '같이',
];

const isStopWord = (word: string) => KOREAN_STOP_WORDS.includes(word);

const isLikelyNoun = (cleanWord: string): boolean => {
  if (!cleanWord) return false;
  if (cleanWord.length < 2) return false;
  if (!/[?-?]/.test(cleanWord)) {
    if (/^\d+$/.test(cleanWord)) return false;
    if (!/^\d+[?-?]/.test(cleanWord)) return false;
  }
  if (isStopWord(cleanWord)) return false;
  if (VERB_OR_PARTICLE_ENDINGS.some(ending => cleanWord.endsWith(ending))) {
    return false;
  }
  return true;
};

const PRIORITY_KEYWORDS = ['하나님', '여호와', '예수', '그리스도', '성령', '언약', 
  '믿음', '복음', '생명', '은혜', '왕', '나라', '영광', '구원', '영생', '사랑', '십자가',
  '어린양', '창조', '천국', '말씀', '찬양', '사도', '가브라엘' , '미가엘'];

const scoreCandidate = (cleanWord: string): number => {
  let score = cleanWord.length;
  if (/^[가-힣]+$/.test(cleanWord)) {
    score += 1;
  }
  if (PRIORITY_KEYWORDS.some(keyword => cleanWord.includes(keyword))) {
    score += 3;
  }
  if (/^\d+[가-힣]/.test(cleanWord)) {
    score += 0.5;
  }
  return score;
};

/**
 * AI가 유효한 퀴즈를 생성하지 못했을 때 DB 기반의 대체 퀴즈를 생성합니다.
 * 이 함수는 핵심 단어를 선택하기 위해 휴리스틱(경험적 규칙)을 사용합니다.
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

  for (const [index, line] of lines.entries()) {
    const lineMatch = line.match(/^(\d+:\d+)\s(.+)/s);
    let finalVerseReference: string;
    let verseText: string;

    if (lineMatch) {
        // Case 1: 절 번호가 있는 경우
        const verseRefPart = lineMatch[1]; // "1:1"
        verseText = lineMatch[2].trim();
        finalVerseReference = `${parsedTopic.book} ${verseRefPart}`;
    } else if (line.trim()) {
        // Case 2: 절 번호가 없는 경우 (새로운 로직)
        verseText = line.trim();
        // topic에서 파싱한 정보와 현재 줄의 순서(index)를 이용해 참조를 만듭니다.
        const verseNum = parsedTopic.verses[index] || (index + 1);
        finalVerseReference = `${parsedTopic.book} ${parsedTopic.chapter}:${verseNum}`;
    } else {
        continue; // 빈 줄은 건너뜁니다.
    }

    const originalWords = verseText.split(/\s+/);

    const candidates = originalWords.map(word => {
        const clean = stripPunctuation(word);
        return {
            original: word,
            clean,
            score: scoreCandidate(clean),
        };
    });

    // 2. Filter for eligible words based on heuristics favoring nouns and key terms.
    let eligibleWords = candidates.filter(({ clean }) => isLikelyNoun(clean));

    // If heuristics filter out everything, revert to a simpler logic (any non-stop word > 2 chars).
    if (eligibleWords.length === 0) {
        eligibleWords = candidates.filter(({ clean }) =>
            clean.length >= 2 && !/^\d+$/.test(clean) && !isStopWord(clean)
        );
        if (eligibleWords.length === 0) continue;
    }

    // 3. Sort candidates by score (length + priority keyword bonus).
    eligibleWords.sort((a, b) => b.score - a.score);

    // 4. Pick from the best-scoring candidates to add variety.
    const selectionPool = eligibleWords.slice(0, Math.min(3, eligibleWords.length));
    const chosenWord = selectionPool[Math.floor(Math.random() * selectionPool.length)];

    const answerWord = chosenWord.original;
    const answerIndex = verseText.indexOf(answerWord);

    // This can fail if the same word appears multiple times and indexOf finds the wrong one,
    // but for a fallback, it's an acceptable trade-off.
    if (answerIndex === -1) continue;

    const part1 = verseText.substring(0, answerIndex);
    const part2 = verseText.substring(answerIndex + answerWord.length);

    const question: FillInTheBlankQuestion = {
      type: QuestionType.FILL_IN_THE_BLANK,
      verseReference: finalVerseReference,
      verseTextParts: [part1, '___', part2].filter(p => p !== ''),
      // The answer should be the clean version without punctuation.
      answers: [chosenWord.clean],
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
