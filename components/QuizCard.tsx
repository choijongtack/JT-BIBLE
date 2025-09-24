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
  aiFeedback?: string | null;
  isEvaluating?: boolean;
}

const QuizCard: React.FC<QuizCardProps> = ({ question, questionNumber, totalQuestions, onSubmit, onNext, onSkip, aiFeedback, isEvaluating }) => {
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    console.log('=== QuizCard Debug ===');
    console.log('Question:', question);
    console.log('Question type:', question.type);
    console.log('QuestionType.FILL_IN_THE_BLANK:', QuestionType.FILL_IN_THE_BLANK);
    console.log('Type match:', question.type === QuestionType.FILL_IN_THE_BLANK);
  
    if (question.type === QuestionType.FILL_IN_THE_BLANK) {
      const q = question as import('../types').FillInTheBlankQuestion;
      console.log('verseTextParts:', q.verseTextParts);
      let blankCount = q.verseTextParts.filter(p => p === '___').length;

    // --- 🔥 방어 로직: blanks가 없는데 answers는 있는 경우 ---
      if (blankCount === 0 && q.answers.length > 0) {
        console.warn("⚠ verseTextParts에 blank 없음. 강제로 blanks 삽입.");
        q.verseTextParts = [q.verseTextParts.join(' '), ...Array(q.answers.length).fill('___')];
        blankCount = q.answers.length;
      }

      console.log('Blank count (final):', blankCount);
      setUserAnswers(Array(blankCount).fill(''));
    } else {
      console.log('Setting single answer');
      setUserAnswers(['']);
    }
    setIsSubmitted(false);
    setIsCorrect(false);
  }, [question]);

    
  const handleInputChange = (index: number, value: string) => {
    console.log(`Input change - Index: ${index}, Value: "${value}"`);
    console.log('Current userAnswers:', userAnswers);
  
    setUserAnswers(currentAnswers => {
      const newAnswers = [...currentAnswers];
      newAnswers[index] = value;
      console.log('New userAnswers:', newAnswers);
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

    if (question.type === QuestionType.QUESTION_ANSWER) {
      if (isEvaluating) {
        return (
          <div className="mt-4 p-4 rounded-lg bg-slate-700/50 border border-slate-600 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-300">AI가 답변을 평가 중입니다...</p>
          </div>
        );
      }
      if (aiFeedback) {
        return (
          <div className="mt-4 p-4 rounded-lg bg-slate-900/50 border border-blue-700 flex flex-col gap-2">
            <h4 className="text-lg font-bold text-blue-300">AI 평가 피드백</h4>
            <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{aiFeedback}</p>
          </div>
        );
      }
      return null;
    }

    const correctAnswers = question.answers.join(', ');

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
  
  const showNextButton = isSubmitted && (
    question.type === QuestionType.FILL_IN_THE_BLANK || 
    (question.type === QuestionType.QUESTION_ANSWER && !!aiFeedback && !isEvaluating)
  );

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
              disabled={!canSubmit || isEvaluating}
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
            >
              {question.type === QuestionType.QUESTION_ANSWER ? '평가 요청' : '정답 확인'}
            </button>
          ) : (
            showNextButton && (
              <button
                type="button"
                onClick={onNext}
                className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
              >
                {questionNumber === totalQuestions ? '시험 완료' : '다음 문제'}
              </button>
            )
          )}
        </div>
      </form>
    </div>
  );
};

export default QuizCard;