import React, { useEffect } from 'react';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onConfirm, onCancel }) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={onCancel}
            aria-modal="true"
            role="dialog"
            aria-labelledby="delete-confirm-title"
        >
            <div
                className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-slate-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 sm:p-8 text-center">
                    <h2 id="delete-confirm-title" className="text-2xl font-bold text-slate-100 mb-4">회원탈퇴를 진행하시겠습니까?</h2>
                    <p className="text-slate-400">
                        이 작업은 되돌릴 수 없으며 모든 학습 기록이 영구적으로 삭제됩니다.
                    </p>
                </div>
                <div className="flex gap-4 p-4 bg-slate-900/50 rounded-b-2xl">
                     <button
                        onClick={onCancel}
                        className="w-full px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-500 transition-colors"
                     >
                        아니요
                     </button>
                     <button
                        onClick={onConfirm}
                        className="w-full px-6 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-500 transition-colors"
                     >
                        예
                     </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmationModal;
