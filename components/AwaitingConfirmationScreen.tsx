import React from 'react';

interface AwaitingConfirmationScreenProps {
    onBackToLogin: () => void;
}

const AwaitingConfirmationScreen: React.FC<AwaitingConfirmationScreenProps> = ({ onBackToLogin }) => (
    <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 mb-4">가입 확인</h2>
        <p className="text-slate-300 text-lg mb-6">
            가입을 완료하려면 받은 편지함에서 확인 이메일을 확인하세요. 이메일을 받지 못했다면 스팸 폴더를 확인해 보세요.
        </p>
        <button
            onClick={onBackToLogin}
            className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
        >
            확인
        </button>
    </div>
);

export default AwaitingConfirmationScreen;