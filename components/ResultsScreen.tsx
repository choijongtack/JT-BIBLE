import React from 'react';
import type { Profile } from '../types';
import ProgressDebugPanel from './ProgressDebugPanel';

interface ResultsScreenProps {
    lastResult: {
        score: number;
        total: number;
        topic: string;
        exitType: 'quiz' | 'save';
    };
    onRestart: () => void;
    onContinue: (book: string) => void;
    progressDebugInfo: {
        before: Profile['progress'] | null;
        request: Profile['progress'] | null;
        after: Profile['progress'] | null;
        error: string | null;
    } | null;
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ lastResult, onRestart, onContinue, progressDebugInfo }) => {
    const { score, total, topic, exitType } = lastResult;
    const bookName = (topic && typeof topic === 'string' ? topic.split(' ')[0] : null) || '성경';
    const isSkipped = score < 0 && exitType === 'quiz';
    const isSaveAndExit = exitType === 'save';

    const getTitle = () => {
        if (isSaveAndExit) return '학습 내용 저장 완료';
        if (isSkipped) return '시험을 건너뛰었습니다';
        return '학습 완료!';
    };

    return (
        <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
            <h2 className="text-3xl font-bold text-slate-100 mb-4">
                {getTitle()}
            </h2>

            {isSaveAndExit ? (
                <p className="text-slate-300 text-lg mb-2">
                    <span className="font-bold text-blue-400">{topic}</span>에 대한 학습 내용이<br />성공적으로 저장되었습니다.
                </p>
            ) : (
                <>
                    <p className="text-slate-300 text-lg mb-2">
                        {isSkipped ? `현재 주제: ${topic}` : '시험 점수:'}
                    </p>
                    {!isSkipped && (
                        <p className="text-5xl font-bold text-blue-400 mb-8">{score} / {total}</p>
                    )}
                </>
            )}

            <div className="flex flex-col gap-4 mt-8">
                {isSaveAndExit ? (
                    <button
                        onClick={onRestart} // onRestart goes back to idle screen
                        className="w-full px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all"
                    >
                        메인 화면으로 돌아가기
                    </button>
                ) : (
                    <>
                        <button
                            onClick={() => onContinue(bookName)}
                            className="w-full px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105"
                        >
                            {bookName} 계속 공부하기
                        </button>
                        <button
                            onClick={onRestart}
                            className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
                        >
                            다른 책 공부하기
                        </button>
                    </>
                )}
            </div>
            <ProgressDebugPanel debugInfo={progressDebugInfo} />
        </div>
    );
};

export default ResultsScreen;
