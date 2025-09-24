import React from 'react';
import type { Profile } from '../types';
import ProgressDebugPanel from './ProgressDebugPanel';

interface ResultsScreenProps {
    lastResult: {
        topic: string;
        exitType: 'save';
    };
    onRestart: () => void;
    progressDebugInfo: {
        before: Profile['progress'] | null;
        request: Profile['progress'] | null;
        after: Profile['progress'] | null;
        error: string | null;
    } | null;
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ lastResult, onRestart, progressDebugInfo }) => {
    const { topic } = lastResult;

    return (
        <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
            <h2 className="text-3xl font-bold text-slate-100 mb-4">
                학습 내용 저장 완료
            </h2>

            <p className="text-slate-300 text-lg mb-2">
                <span className="font-bold text-blue-400">{topic}</span>에 대한 학습 내용이<br />성공적으로 저장되었습니다.
            </p>

            <div className="flex flex-col gap-4 mt-8">
                <button
                    onClick={onRestart}
                    className="w-full px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all"
                >
                    메인 화면으로 돌아가기
                </button>
            </div>
            <ProgressDebugPanel debugInfo={progressDebugInfo} />
        </div>
    );
};

export default ResultsScreen;