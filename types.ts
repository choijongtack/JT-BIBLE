import { LearningStep } from './constants';

export enum QuestionType {
  FILL_IN_THE_BLANK = 'FILL_IN_THE_BLANK',
  QUESTION_ANSWER = 'QUESTION_ANSWER',
}

export interface FillInTheBlankQuestion {
  type: QuestionType.FILL_IN_THE_BLANK;
  verseReference: string;
  verseTextParts: string[]; // "___" represents a blank
  answers: string[];
}

export interface QAQuestion {
  type: QuestionType.QUESTION_ANSWER;
  verseReference: string;
  question: string;
  answer: string;
}

export type QuizQuestion = FillInTheBlankQuestion | QAQuestion;

export interface Quiz {
  topic: string;
  questions: QuizQuestion[];
}

export type AppStatus = 'login' | 'idle' | 'loading' | 'learning' | 'finished' | 'error' | 'awaiting-confirmation' | 'profile_error';

export type ChatMessage = {
  // FIX: Expanded `role` to include 'system' to properly handle chat history for models
  // that use a system prompt (e.g., ChatGPT, Perplexity).
  role: 'user' | 'model' | 'system';
  content: string;
};

export type AiModel = 'gemini' | 'perplexity' | 'chatgpt';

export interface LearningSessionState {
  topic: string;
  currentStep: LearningStep;
  messages: ChatMessage[];
  aiModel: AiModel;
  mode: 'general' | 'advanced';
  bibleVerse: string | null;
  score: number;
  quizData: Quiz | null;
  currentQuestionIndex: number;
  isComplete?: boolean;
}

// 마지막으로 완료된 학습 지점을 표시하는 새 구조
export interface CompletionMarker {
  book: string;
  chapter: number;
  verse: number;
}


// 각 책의 진행 상황을 더 자세히 추적하기 위한 새 인터페이스
export interface BookProgress {
  lastSession: LearningSessionState;
  completionMarker: CompletionMarker | null;
  totalCompletedVerses: number;
}

export interface UserProgress {
    [book: string]: BookProgress;
}

export interface Profile {
    id: string;
    email?: string;
    progress: UserProgress;
    chatgpt_api_key?: string;
    perplexity_api_key?: string;
}