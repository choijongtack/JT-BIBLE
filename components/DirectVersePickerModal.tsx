import React, { useEffect, useMemo, useState } from 'react';
import { NEW_TESTAMENT_BOOKS, OLD_TESTAMENT_BOOKS } from '../constants';
import { BIBLE_METADATA } from '../services/bibleData';
import { getLastVerseInChapter } from '../services/bibleService';

type Step = 'testament' | 'book' | 'passage';
type Testament = 'old' | 'new';

interface DirectVersePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (reference: string) => void;
}

const DirectVersePickerModal: React.FC<DirectVersePickerModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [step, setStep] = useState<Step>('testament');
  const [testament, setTestament] = useState<Testament | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [chapter, setChapter] = useState(1);
  const [startVerse, setStartVerse] = useState(1);
  const [endVerse, setEndVerse] = useState(1);
  const [lastVerse, setLastVerse] = useState<number | null>(null);
  const [isLoadingVerses, setIsLoadingVerses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBooks = useMemo(
    () => (testament === 'old' ? OLD_TESTAMENT_BOOKS : NEW_TESTAMENT_BOOKS),
    [testament],
  );

  const resetState = () => {
    setStep('testament');
    setTestament(null);
    setSelectedBook(null);
    setChapter(1);
    setStartVerse(1);
    setEndVerse(1);
    setLastVerse(null);
    setIsLoadingVerses(false);
    setError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchLastVerse = async () => {
      if (step !== 'passage' || !selectedBook) return;

      setIsLoadingVerses(true);
      setError(null);
      const result = await getLastVerseInChapter(selectedBook, chapter);
      setIsLoadingVerses(false);

      if (result.error || result.lastVerse === null) {
        setError(result.error || '절 정보를 불러오지 못했습니다.');
        setLastVerse(null);
        return;
      }

      setLastVerse(result.lastVerse);
      setStartVerse(prev => Math.min(Math.max(1, prev), result.lastVerse!));
      setEndVerse(prev => Math.min(Math.max(1, prev), result.lastVerse!));
    };

    fetchLastVerse();
  }, [step, selectedBook, chapter]);

  useEffect(() => {
    if (!lastVerse) return;
    if (startVerse > endVerse) {
      setEndVerse(startVerse);
    }
  }, [startVerse, endVerse, lastVerse]);

  if (!isOpen) return null;

  const closeModal = () => {
    onClose();
  };

  const handlePickBook = (book: string) => {
    setSelectedBook(book);
    setChapter(1);
    setStartVerse(1);
    setEndVerse(1);
    setStep('passage');
  };

  const handleConfirm = () => {
    if (!selectedBook || !lastVerse) return;
    const range = startVerse === endVerse ? `${startVerse}` : `${startVerse}-${endVerse}`;
    onSelect(`${selectedBook} ${chapter}:${range}`);
    onClose();
  };

  const selectedBookMeta = selectedBook ? BIBLE_METADATA[selectedBook] : null;
  const chapterOptions = Array.from({ length: selectedBookMeta?.chapters ?? 0 }, (_, idx) => idx + 1);
  const startVerseOptions = Array.from({ length: lastVerse ?? 0 }, (_, idx) => idx + 1);
  const endVerseOptions = Array.from({ length: (lastVerse ?? 0) - startVerse + 1 }, (_, idx) => startVerse + idx);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeModal} role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-700 p-4 sm:p-6">
          <h3 className="text-xl font-bold text-slate-100">
            {step === 'testament' && '성경 구분 선택'}
            {step === 'book' && '책 선택'}
            {step === 'passage' && '장/절 선택'}
          </h3>
          {selectedBook && step === 'passage' && <p className="mt-1 text-sm text-slate-400">{selectedBook}</p>}
        </div>

        <div className="p-4 sm:p-6">
          {step === 'testament' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => {
                  setTestament('old');
                  setStep('book');
                }}
                className="rounded-lg bg-blue-600 px-4 py-4 font-semibold text-white hover:bg-blue-500"
              >
                구약
              </button>
              <button
                onClick={() => {
                  setTestament('new');
                  setStep('book');
                }}
                className="rounded-lg bg-emerald-600 px-4 py-4 font-semibold text-white hover:bg-emerald-500"
              >
                신약
              </button>
            </div>
          )}

          {step === 'book' && (
            <div>
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {selectedBooks.map((book) => (
                  <button
                    key={book}
                    onClick={() => handlePickBook(book)}
                    className="rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
                  >
                    {book}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'passage' && (
            <div className="space-y-4">
              {error && <p className="rounded-md bg-red-900/50 p-3 text-sm text-red-300">{error}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">장</label>
                  <select
                    value={chapter}
                    onChange={(e) => setChapter(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100"
                  >
                    {chapterOptions.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}장
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">시작 절</label>
                  <select
                    value={startVerse}
                    onChange={(e) => setStartVerse(Number(e.target.value))}
                    disabled={isLoadingVerses || !lastVerse}
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60"
                  >
                    {startVerseOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}절
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">끝 절</label>
                  <select
                    value={endVerse}
                    onChange={(e) => setEndVerse(Number(e.target.value))}
                    disabled={isLoadingVerses || !lastVerse}
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60"
                  >
                    {endVerseOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}절
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                {isLoadingVerses ? '절 목록을 불러오는 중...' : lastVerse ? `이 장의 마지막 절: ${lastVerse}절` : '장 정보를 불러오지 못했습니다.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-700 p-4 sm:flex-row sm:justify-end">
          {step !== 'testament' && (
            <button
              onClick={() => {
                if (step === 'book') setStep('testament');
                if (step === 'passage') setStep('book');
              }}
              className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-slate-100 hover:bg-slate-600"
            >
              이전
            </button>
          )}
          <button onClick={closeModal} className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-slate-100 hover:bg-slate-600">
            닫기
          </button>
          {step === 'passage' && (
            <button
              onClick={handleConfirm}
              disabled={isLoadingVerses || Boolean(error) || !lastVerse}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:bg-slate-600"
            >
              이 구절로 선택
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DirectVersePickerModal;
