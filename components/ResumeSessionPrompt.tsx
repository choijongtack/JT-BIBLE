import React from 'react';
import type { LearningSessionState } from '../types';

interface ResumeSessionPromptProps {
    session: LearningSessionState;
    onResume: () => void;
    onDiscard: () => void;
}

const ResumeSessionPrompt: React.FC<ResumeSessionPromptProps> = ({ session, onResume, onDiscard }) => (
    <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 mb-4">진행 중인 학습 발견</h2>
        <p className="text-slate-300 text-lg mb-6">
            <span className="font-bold text-blue-400">{session.topic}</span> 학습을 이어서 하시겠습니까?
        </p>
        <div className="flex flex-col gap-4">
            <button
                onClick={onResume}
                className="w-full px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105"
            >
                학습 이어하기
            </button>
            <button
                onClick={onDiscard}
                className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
            >
                새로운 학습 시작
            </button>
        </div>
    </div>
);

export default ResumeSessionPrompt;
