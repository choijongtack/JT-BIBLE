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

export type AppStatus = 'login' | 'idle' | 'loading' | 'learning' | 'finished' | 'error' | 'session-prompt' | 'awaiting-confirmation' | 'profile_error';

export type ChatMessage = {
  role: 'user' | 'model';
  content: string;
};

export type AiModel = 'gemini' | 'perplexity' | 'chatgpt';

export interface LearningSessionState {
  topic: string;
  currentStep: LearningStep;
  messages: ChatMessage[];
  aiModel: AiModel;
  apiKey?: string;
  bibleVerse: string | null;
  score: number;
  quizData: Quiz | null;
  currentQuestionIndex: number;
}

export interface UserProgress {
    [book: string]: string[];
}

export interface Profile {
    id: string;
    email?: string;
    progress: UserProgress;
    active_learning_session: LearningSessionState | null;
}