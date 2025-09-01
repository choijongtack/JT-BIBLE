
import React, { useState, useCallback } from 'react';
import type { AppStatus } from './types';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from './constants';
import LoginScreen from './components/LoginScreen';
import ConversationalLearning from './components/LearningSession';

const AppHeader: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
    <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10">
        <div className="text-lg font-bold text-slate-200">성경 공부 도우미</div>
        <button
            onClick={onLogout}
            className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors text-sm"
        >
            로그아웃
        </button>
    </header>
);

const WelcomeScreen: React.FC<{ onStart: (topic: string) => void }> = ({ onStart }) => {
    const [selectedBook, setSelectedBook] = useState<string | null>(null);
    const [selectedAI, setSelectedAI] = useState('gemini');

    const handleStart = () => {
        if (selectedBook) {
            onStart(`${selectedBook} 1:3-14`); // Default to Ephesians 1:3-14 as per conversation example
        }
    };

    const BookButton: React.FC<{ book: string }> = ({ book }) => (
        <button
            onClick={() => setSelectedBook(book)}
            className={`w-full text-center px-2 py-2 rounded-md transition-colors text-sm ${
                selectedBook === book
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
        >
            {book}
        </button>
    );

    return (
        <div className="w-full max-w-4xl mx-auto bg-slate-800/50 p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-slate-100 mb-2">성경 공부 도우미</h1>
                <p className="text-lg text-slate-300 mb-4">변호사의 방법</p>
                <p className="text-slate-400">공부하고 싶은 성경을 선택하고 학습을 시작하세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                <div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">구약 (39권)</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-2">
                        {OLD_TESTAMENT_BOOKS.map(book => <BookButton key={book} book={book} />)}
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-4 text-center">신약 (27권)</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-2">
                        {NEW_TESTAMENT_BOOKS.map(book => <BookButton key={book} book={book} />)}
                    </div>
                </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-700">
                 <div className="flex flex-col items-center justify-center gap-6">
                    <div>
                        <h4 className="text-lg font-semibold text-slate-200 mb-3 text-center">AI 모델 선택</h4>
                        <div className="flex justify-center gap-4">
                            <button 
                                onClick={() => setSelectedAI('gemini')}
                                className={`px-5 py-2 rounded-lg font-semibold transition-all ${selectedAI === 'gemini' ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                            >
                                Gemini 2.5 Flash
                            </button>
                             <button 
                                onClick={() => alert('ChatGPT 연동은 곧 제공될 예정입니다!')}
                                className="px-5 py-2 rounded-lg font-semibold bg-slate-700 text-slate-500 cursor-not-allowed relative"
                                title="곧 제공될 예정입니다"
                            >
                                ChatGPT 4.o
                                <span className="absolute top-0 right-0 -mt-2 -mr-2 px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded-full">SOON</span>
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={handleStart}
                        disabled={!selectedBook}
                        className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500 transition-all transform hover:scale-105 disabled:bg-slate-600 disabled:cursor-not-allowed disabled:scale-100"
                    >
                        {selectedBook ? `${selectedBook} 학습 시작` : '학습 세션 시작하기'}
                    </button>
                     {selectedBook && <p className="text-center text-sm text-slate-400 -mt-2">선택된 성경: <span className="font-bold text-blue-400">{selectedBook} 1:3-14</span></p>}
                </div>
            </div>
        </div>
    );
};

const ResultsScreen: React.FC<{ score: number; total: number; onRestart: () => void }> = ({ score, total, onRestart }) => (
    <div className="text-center bg-slate-800/50 p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 mb-4">학습 완료!</h2>
        <p className="text-slate-300 text-lg mb-2">시험 점수:</p>
        <p className="text-5xl font-bold text-blue-400 mb-8">{score} / {total}</p>
        <button
            onClick={onRestart}
            className="px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all transform hover:scale-105"
        >
            다른 주제로 공부하기
        </button>
    </div>
);


const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>('login');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentTopic, setCurrentTopic] = useState<string>('');
    const [lastScore, setLastScore] = useState<{ score: number, total: number }>({ score: 0, total: 0 });


    const handleStartLearning = useCallback((topic: string) => {
        setCurrentTopic(topic);
        setStatus('learning');
    }, []);
    
    const handleFinishLearning = useCallback((score: number, total: number) => {
        setLastScore({ score, total });
        setStatus('finished');
    }, []);

    const handleRestart = () => {
        setStatus('idle');
        setCurrentTopic('');
    };
    
    const handleLogin = () => {
        setIsAuthenticated(true);
        setStatus('idle');
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        setCurrentTopic('');
        setStatus('login');
    };

    const renderContent = () => {
        if (!isAuthenticated) {
            return <LoginScreen onLogin={handleLogin} />;
        }

        switch (status) {
            case 'idle':
                return <WelcomeScreen onStart={handleStartLearning} />;
            case 'learning':
                return <ConversationalLearning topic={currentTopic} onFinish={handleFinishLearning} onBack={handleRestart} />;
            case 'finished':
                return <ResultsScreen score={lastScore.score} total={lastScore.total} onRestart={handleRestart} />;
            default:
                return <LoginScreen onLogin={handleLogin} />;
        }
    };

    return (
        <main className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-900 text-white font-sans relative">
            {isAuthenticated && <AppHeader onLogout={handleLogout} />}
            <div className="w-full h-full flex items-center justify-center">
                 {renderContent()}
            </div>
        </main>
    );
};

export default App;
