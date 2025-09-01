
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

export type AppStatus = 'login' | 'idle' | 'loading' | 'learning' | 'finished' | 'error';

export type ChatMessage = {
  role: 'user' | 'model';
  content: string;
};
