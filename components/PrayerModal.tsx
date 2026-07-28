import React, { useEffect } from 'react';

interface PrayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    prayerText: string;
    topic: string;
    onConfirm?: () => void;
    confirmButtonText?: string;
}

const PrayerModal: React.FC<PrayerModalProps> = ({ isOpen, onClose, prayerText, topic, onConfirm, confirmButtonText }) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const isError = prayerText.includes("실패했습니다");

    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
            aria-labelledby="prayer-modal-title"
        >
            <div
                className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-slate-700 animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 sm:p-8 text-center">
                    <div className="flex justify-center items-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 mr-3 ${isError ? 'text-red-400' : 'text-blue-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                           {isError ? (
                                <>
                                    <path d="M12 9v4m0 4h.01" />
                                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </>
                           ) : (
                                <>
                                    <path d="M21.5 12a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z" />
                                    <path d="M11.1 8.3a1 1 0 1 0-1.2 1.6l1.3 1.3-1.3 1.3a1 1 0 1 0 1.2 1.6l1.8-1.8a1 1 0 0 0 0-1.6z" />
                                    <path d="M14.2 11.2a1 1 0 0 0-1.6-1.2l-1.3 1.3-1.3-1.3a1 1 0 0 0-1.6 1.2l1.8 1.8a1 1 0 0 0 1.6 0z" />
                                </>
                           )}
                        </svg>
                        <h2 id="prayer-modal-title" className="text-2xl font-bold text-slate-100">
                            {isError ? "알림" : `'${topic}' 말씀을 묵상하는 기도`}
                        </h2>
                    </div>
                    <p className={`text-left whitespace-pre-wrap leading-relaxed ${isError ? 'text-red-300' : 'text-slate-300'}`}>
                        {prayerText}
                    </p>
                </div>
                <div className="flex p-4 bg-slate-900/50 rounded-b-2xl">
                     <button
                        onClick={onConfirm || onClose}
                        className="w-full px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-500 transition-colors"
                     >
                        {confirmButtonText || '확인'}
                     </button>
                </div>
            </div>
            <style>{`
                @keyframes fade-in {
                  from { opacity: 0; transform: scale(0.95); }
                  to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                  animation: fade-in 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default PrayerModal;
