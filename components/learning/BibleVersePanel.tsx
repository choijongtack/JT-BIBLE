import React, { useState } from 'react';

// This modal is only used by the panel, so it's defined here and not exported.
const BibleVerseModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  topic: string;
  verse: string | null;
  source: 'DB' | 'AI' | null;
  fetchError: string | null;
}> = ({ isOpen, onClose, topic, verse, source, fetchError }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="w-full max-w-lg max-h-[80vh] bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b border-slate-700 flex-shrink-0 flex justify-between items-center">
            <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-bold text-slate-100">{topic} 본문</h2>
                {source && (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${source === 'DB' ? 'bg-green-600 text-green-100' : 'bg-yellow-600 text-yellow-100'}`}>
                        {source}
                    </span>
                )}
            </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">
            {fetchError && (
                <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-yellow-300">
                    <p className="font-bold mb-1">DB 불러오기 실패 (AI 대체)</p>
                    <p>{fetchError}</p>
                </div>
            )}
            {verse ? (
                <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{verse}</p>
            ) : (
                <p className="text-slate-400">성경 본문을 불러오는 중입니다...</p>
            )}
        </div>
      </div>
    </div>
  );
};

const BibleVersePanel: React.FC<{ topic: string, verse: string | null, source: 'DB' | 'AI' | null, fetchError: string | null }> = ({ topic, verse, source, fetchError }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <BibleVerseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        topic={topic}
        verse={verse}
        source={source}
        fetchError={fetchError}
      />
      <div className="w-full sm:w-1/3 flex-shrink-0 sm:h-auto bg-slate-800/50 rounded-2xl shadow-inner border border-slate-700 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
            <div className="flex items-baseline gap-3">
                <h2 className="text-lg sm:text-xl font-bold text-slate-100">{topic} 본문</h2>
                {source && (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${source === 'DB' ? 'bg-green-600 text-green-100' : 'bg-yellow-600 text-yellow-100'}`}>
                        {source}
                    </span>
                )}
            </div>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!verse}
            className="sm:hidden px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:bg-slate-600"
          >
            본문 보기
          </button>
        </div>
        <div className="hidden sm:block p-4 sm:p-6 overflow-y-auto h-full">
            {fetchError && (
                <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-yellow-300">
                    <p className="font-bold mb-1">DB 불러오기 실패</p>
                    <p>{fetchError}</p>
                </div>
            )}
            {verse ? (
                <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{verse}</p>
            ) : (
                 !fetchError && <p className="text-slate-400">성경 본문을 불러오는 중입니다...</p>
            )}
        </div>
      </div>
    </>
  );
};

export default BibleVersePanel;
