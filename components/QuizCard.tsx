import React, { useState, useEffect } from 'react';
import type { QuizQuestion } from '../types';
import { QuestionType } from '../types';
import { IconCheck, IconX } from '../constants';

interface QuizCardProps {
  question: QuizQuestion;
  questionNumber: number;
  totalQuestions: number;
  onSubmit: (answers: string[]) => boolean;
  onNext: () => void;
  onSkip: () => void;
}

const QuizCard: React.FC<QuizCardProps> = ({ question, questionNumber, totalQuestions, onSubmit, onNext, onSkip }) => {
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    if (question.type === QuestionType.FILL_IN_THE_BLANK) {
      const blankCount = (question as import('../types').FillInTheBlankQuestion)
        .verseTextParts.filter(p => p === '___').length;
      setUserAnswers(Array(blankCount).fill(''));
    } else {
      setUserAnswers(['']);
    }
    setIsSubmitted(false);
    setIsCorrect(false);
  }, [question]);

  const handleInputChange = (index: number, value: string) => {
    setUserAnswers(currentAnswers => {
      const newAnswers = [...currentAnswers];
      newAnswers[index] = value;
      return newAnswers;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitted) return;
    const correct = onSubmit(userAnswers);
    setIsCorrect(correct);
    setIsSubmitted(true);
  };

  const renderFillInTheBlank = () => {
    const q = question as import('../types').FillInTheBlankQuestion;
    let answerIndex = 0;
    return (
      <div className="text-lg/relaxed sm:text-xl/relaxed text-slate-300 flex flex-wrap items-baseline gap-x-2 gap-y-4">
        {q.verseTextParts.map((part, i) => {
          if (part === '___') {
            const currentIndex = answerIndex++;
            return (
              <input
                key={`blank-${i}-${currentIndex}`}
                type="text"
                value={userAnswers[currentIndex] || ''}
                onChange={(e) => handleInputChange(currentIndex, e.target.value)}
                readOnly={isSubmitted}
                className="inline-block w-28 sm:w-32 px-2 py-1 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                autoFocus={currentIndex === 0}
                aria-label={`Blank ${currentIndex + 1}`}
              />
            );
          }
          return <span key={`text-${i}`}>{part}</span>;
        })}
      </div>
    );
  };

  const renderQuestionAnswer = () => {
    const q = question as import('../types').QAQuestion;
    return (
      <div>
        <p className="text-lg/relaxed sm:text-xl/relaxed text-slate-300 mb-4">{q.question}</p>
        <textarea
          value={userAnswers[0] || ''}
          onChange={(e) => handleInputChange(0, e.target.value)}
          readOnly={isSubmitted}
          className="w-full h-32 p-3 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none"
          placeholder="답변을 입력하세요..."
          autoFocus
        />
      </div>
    );
  };

  const renderFeedback = () => {
    if (!isSubmitted) return null;
    const correctAnswers = question.type === QuestionType.FILL_IN_THE_BLANK ? question.answers.join(', ') : question.answer;

    if (isCorrect) {
      return (
        <div className="mt-4 p-4 rounded-lg bg-green-900/50 border border-green-700 flex items-center gap-3">
          <IconCheck className="w-6 h-6 text-green-400 shrink-0" />
          <p className="text-green-300">정답입니다! 잘하셨어요.</p>
        </div>
      );
    }

    return (
      <div className="mt-4 p-4 rounded-lg bg-red-900/50 border border-red-700 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <IconX className="w-6 h-6 text-red-400 shrink-0" />
          <p className="text-red-300">틀렸습니다. 정답은 다음과 같습니다:</p>
        </div>
        <p className="pl-9 text-red-200 font-mono text-sm">"{correctAnswers}"</p>
      </div>
    );
  };

  const canSubmit = userAnswers.length > 0 && userAnswers.every(answer => answer.trim() !== '');

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-800/50 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-blue-400">{question.verseReference}</p>
        <p className="text-slate-400 text-sm">문제 {questionNumber} / {totalQuestions}</p>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {question.type === QuestionType.FILL_IN_THE_BLANK ? renderFillInTheBlank() : renderQuestionAnswer()}
        </div>

        {renderFeedback()}
        
        <div className="mt-8 pt-6 border-t border-slate-700 flex justify-between items-center">
          <button
            type="button"
            onClick={onSkip}
            className="px-5 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            시험 건너뛰기
          </button>
          {!isSubmitted ? (
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
            >
              정답 확인
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
            >
              {questionNumber === totalQuestions ? '결과 보기' : '다음 문제'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default QuizCard;