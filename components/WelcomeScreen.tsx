import React, { useEffect, useRef, useState } from 'react';
import type { AiModel, AppStatus, Profile } from '../types';
import type { CompletedPassage } from '../services/userDataService';
import { IconCheck, IconLoader, NEW_TESTAMENT_BOOKS, OLD_TESTAMENT_BOOKS } from '../constants';
import { calculateVerseProgressForList, BIBLE_METADATA } from '../services/bibleData';
import { parseReference } from '../services/bibleUtils';
import { saveChatGptApiKey, deleteChatGptApiKey, getChatGptModel, setPreferredChatGptModel, CHATGPT_ALLOWED_MODELS } from '../services/chatgptService';
import { GEMINI_ALLOWED_MODELS, getGeminiModel, setPreferredGeminiModel } from '../services/geminiService';
import { savePerplexityApiKey, deletePerplexityApiKey } from '../services/perplexityService';
import CalvinChatModal from './CalvinChatModal';
import DirectVersePickerModal from './DirectVersePickerModal';

type ApiKeyStatus = 'unsaved' | 'saving' | 'saved' | 'error' | 'editing';

interface WelcomeScreenProps {
  status: AppStatus;
  loadingMessage: string;
  isActionLoading: boolean;
  onStart: (book: string, aiModel: AiModel, mode?: 'general' | 'advanced', customTopic?: string) => void;
  profile: Profile | null;
  completedPassages: CompletedPassage[] | null;
  onLogout: () => void;
  onDelete: () => void;
  onGptKeySaved: () => void;
  onPerplexityKeySaved: () => void;
  onGptKeyDeleted: () => void;
  onPerplexityKeyDeleted: () => void;
}

const IconQuestionMark: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
  </svg>
);

const StatProgressBar: React.FC<{ label: string; studied: number; total: number; unit: string }> = ({ label, studied, total, unit }) => {
  const percentage = total > 0 ? (studied / total) * 100 : 0;
  const displayPercentage = Math.min(100, percentage).toFixed(1);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 flex w-full items-baseline justify-between">
        <span className="font-semibold text-slate-300">{label}</span>
        <span className="text-sm text-slate-400">
          {studied.toLocaleString()} / {total.toLocaleString()} {unit} {total > 0 && `(${displayPercentage}%)`}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-700">
        <div className="h-2.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${displayPercentage}%` }} />
      </div>
    </div>
  );
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  status,
  loadingMessage,
  isActionLoading,
  onStart,
  profile,
  completedPassages,
  onLogout,
  onDelete,
  onGptKeySaved,
  onPerplexityKeySaved,
  onGptKeyDeleted,
  onPerplexityKeyDeleted,
}) => {
  const isLoading = status === 'loading' || isActionLoading;
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedAI, setSelectedAI] = useState<AiModel>('gemini');
  const [customReference, setCustomReference] = useState('');
  const [customReferenceError, setCustomReferenceError] = useState<string | null>(null);
  const [isDirectPickerOpen, setIsDirectPickerOpen] = useState(false);

  const [isCalvinChatOpen, setIsCalvinChatOpen] = useState(false);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<string>(getGeminiModel());
  const [selectedChatGptModel, setSelectedChatGptModel] = useState<string>(getChatGptModel());

  const [perplexityApiKey, setPerplexityApiKey] = useState('');
  const [perplexityKeyStatus, setPerplexityKeyStatus] = useState<ApiKeyStatus>('unsaved');
  const [perplexityKeyError, setPerplexityKeyError] = useState<string | null>(null);

  const [chatGptApiKey, setChatGptApiKey] = useState('');
  const [chatGptKeyStatus, setChatGptKeyStatus] = useState<ApiKeyStatus>('unsaved');
  const [chatGptKeyError, setChatGptKeyError] = useState<string | null>(null);

  const [showGeneralInfo, setShowGeneralInfo] = useState(false);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
  const generalInfoRef = useRef<HTMLDivElement>(null);
  const advancedInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.chatgpt_api_key) {
      setChatGptKeyStatus('saved');
    } else {
      setChatGptKeyStatus('unsaved');
      setChatGptApiKey('');
    }

    if (profile?.perplexity_api_key) {
      setPerplexityKeyStatus('saved');
    } else {
      setPerplexityKeyStatus('unsaved');
      setPerplexityApiKey('');
    }
    setSelectedChatGptModel(getChatGptModel());
    setSelectedGeminiModel(getGeminiModel());
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (generalInfoRef.current && !generalInfoRef.current.contains(event.target as Node)) setShowGeneralInfo(false);
      if (advancedInfoRef.current && !advancedInfoRef.current.contains(event.target as Node)) setShowAdvancedInfo(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSavePerplexityKey = async () => {
    setPerplexityKeyStatus('saving');
    setPerplexityKeyError(null);
    try {
      await savePerplexityApiKey(perplexityApiKey.trim());
      setPerplexityKeyStatus('saved');
      onPerplexityKeySaved();
    } catch (e) {
      setPerplexityKeyStatus('error');
      setPerplexityKeyError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    }
  };

  const handleSaveGptKey = async () => {
    setChatGptKeyStatus('saving');
    setChatGptKeyError(null);
    try {
      await saveChatGptApiKey(chatGptApiKey.trim());
      setChatGptKeyStatus('saved');
      onGptKeySaved();
    } catch (e) {
      setChatGptKeyStatus('error');
      setChatGptKeyError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    }
  };

  const handleDeleteKey = async (model: 'chatgpt' | 'perplexity') => {
    if (!window.confirm(`${model === 'chatgpt' ? 'ChatGPT' : 'Perplexity'} API 키를 삭제하시겠습니까?`)) return;
    try {
      if (model === 'chatgpt') { await deleteChatGptApiKey(); onGptKeyDeleted(); setChatGptKeyStatus('unsaved'); }
      else { await deletePerplexityApiKey(); onPerplexityKeyDeleted(); setPerplexityKeyStatus('unsaved'); }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'API 키 삭제에 실패했습니다.';
      if (model === 'chatgpt') setChatGptKeyError(message); else setPerplexityKeyError(message);
    }
  };

  const trimmedCustomReference = customReference.trim();
  const parsedCustomReference = trimmedCustomReference ? parseReference(trimmedCustomReference) : null;
  const selectedStartBook = parsedCustomReference?.book ?? selectedBook;

  const savedSessionForSelectedBook = profile?.progress?.[selectedStartBook || '']?.lastSession;
  const isInProgress = Boolean(savedSessionForSelectedBook && !savedSessionForSelectedBook.isComplete);
  const inProgressMode = isInProgress ? savedSessionForSelectedBook?.mode : null;

  const isStartDisabled =
    !selectedStartBook ||
    (selectedAI === 'perplexity' && perplexityKeyStatus !== 'saved') ||
    (selectedAI === 'chatgpt' && chatGptKeyStatus !== 'saved');

  const isGeneralStartDisabled = isStartDisabled || (isInProgress && inProgressMode !== 'general');
  const isAdvancedStartDisabled = isStartDisabled || (isInProgress && inProgressMode !== 'advanced');

  const handleStart = (mode: 'general' | 'advanced') => {
    if (!selectedStartBook) {
      setCustomReferenceError('학습할 성경을 선택하거나 구절을 직접 입력해 주세요.');
      return;
    }

    if (trimmedCustomReference && !parsedCustomReference) {
      setCustomReferenceError('구절 형식이 올바르지 않습니다. 예: 요한복음 3:16 또는 요한복음 3:16-18');
      return;
    }

    setCustomReferenceError(null);
    onStart(selectedStartBook, selectedAI, mode, parsedCustomReference ? trimmedCustomReference : undefined);
  };

  const getApiErrorMessage = (error: string | null, onSwitchToGemini: () => void, modelName: string) => {
    if (!error) return null;

    let specificHelp = '';
    const lowerError = error.toLowerCase();
    if (modelName === 'Perplexity' && (lowerError.includes('invalid') || lowerError.includes('token'))) {
      specificHelp = 'Perplexity 대시보드에서 API 키를 다시 복사해 주세요.';
    }
    if (modelName === 'ChatGPT' && (lowerError.includes('incorrect api key') || lowerError.includes('invalid authentication'))) {
      specificHelp = 'OpenAI API 키가 올바른지 확인해 주세요.';
    }

    return (
      <div className="mt-2 space-y-2 text-xs text-red-400">
        <p>API 키 저장에 실패했습니다.</p>
        <p className="rounded bg-red-900/50 p-2 font-mono text-red-300">상세 오류: {error}</p>
        {specificHelp && <p className="rounded bg-slate-700/50 p-3 text-slate-300">{specificHelp}</p>}
        <button type="button" onClick={onSwitchToGemini} className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-500">
          Gemini 모델로 전환
        </button>
      </div>
    );
  };

  const BookButton: React.FC<{ book: string }> = ({ book }) => {
    const isSelected = selectedBook === book;
    const bookProgress = profile?.progress?.[book];
    const bookMeta = BIBLE_METADATA[book];
    const isFullyCompleted =
      Boolean(bookProgress?.completionMarker) &&
      Boolean(bookMeta) &&
      bookProgress!.completionMarker.chapter === bookMeta!.chapters &&
      bookProgress!.completionMarker.verse >= bookMeta!.versesInLastChapter;
    const bookInProgress = Boolean(bookProgress?.lastSession && !bookProgress.lastSession.isComplete);
    const hasCompletedTopics = Boolean(bookProgress?.completionMarker);

    return (
      <button
        onClick={() => {
          setSelectedBook(book);
          setCustomReferenceError(null);
        }}
        className={`group relative w-full rounded-md px-2 py-2 text-center text-sm transition-colors ${
          isSelected
            ? 'bg-blue-600 font-bold text-white'
            : isFullyCompleted
              ? 'bg-green-800 text-green-200 ring-1 ring-green-500/50 hover:bg-green-700'
              : bookInProgress
                ? 'bg-slate-700 text-slate-200 ring-1 ring-yellow-500/50 hover:bg-slate-600'
                : hasCompletedTopics
                  ? 'bg-slate-700 text-slate-200 ring-1 ring-blue-500/50 hover:bg-slate-600'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`}
      >
        {bookInProgress && <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-400" title="진행 중" />}
        {!bookInProgress && hasCompletedTopics && (
          <IconCheck className={`absolute right-1 top-1 h-3.5 w-3.5 ${isFullyCompleted ? 'text-green-300' : 'text-blue-400'}`} />
        )}
        <span className="relative z-10">{book}</span>
      </button>
    );
  };

  const totalProgress = calculateVerseProgressForList(profile?.progress, [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS], completedPassages);
  const otProgress = calculateVerseProgressForList(profile?.progress, OLD_TESTAMENT_BOOKS, completedPassages);
  const ntProgress = calculateVerseProgressForList(profile?.progress, NEW_TESTAMENT_BOOKS, completedPassages);
  const bookLastTopic = profile?.progress?.[selectedStartBook || '']?.lastSession?.topic;

  return (
    <div className="relative mx-auto w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-800/50 p-4 shadow-2xl backdrop-blur-sm sm:p-8">
      {isLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-slate-800/80 backdrop-blur-sm">
          <IconLoader className="mb-4 h-12 w-12 animate-spin text-blue-400" />
          <p className="px-4 text-center text-lg text-slate-300">{loadingMessage}</p>
        </div>
      )}

      <header className="mb-8 flex flex-col items-center sm:flex-row sm:justify-between">
        <div className="mt-4 flex flex-shrink-0 items-center gap-2 sm:mt-0 sm:flex-1 sm:justify-start">
          <button
            onClick={() => setIsCalvinChatOpen(true)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-600"
          >
            기독교 강요
          </button>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">성경 공부 도우미</h1>
          <p className="mt-1 text-lg text-slate-300">4단계 학습 방법</p>
        </div>
        <div className="mt-4 flex flex-shrink-0 items-center gap-2 sm:mt-0 sm:flex-1 sm:justify-end">
          <button onClick={onDelete} className="rounded-lg px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-300">
            회원 탈퇴
          </button>
          <button onClick={onLogout} className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-slate-500">
            로그아웃
          </button>
        </div>
      </header>

      <p className="mb-8 text-center text-slate-400">공부할 성경을 선택하고 학습 모드를 정해 주세요.</p>

      <div className="mb-8 px-4 sm:px-0">
        <h3 className="mb-4 text-center text-xl font-semibold text-slate-200">전체 학습 진행률 (완료한 구절 기준)</h3>
        <div className="grid grid-cols-1 gap-6 rounded-lg bg-slate-900/50 p-4 sm:grid-cols-3">
          <StatProgressBar label="성경 전체" studied={totalProgress.completed} total={totalProgress.total} unit="절" />
          <StatProgressBar label="구약" studied={otProgress.completed} total={otProgress.total} unit="절" />
          <StatProgressBar label="신약" studied={ntProgress.completed} total={ntProgress.total} unit="절" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-4 text-center text-xl font-semibold text-slate-200">구약 (39권)</h3>
          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-2 sm:grid-cols-3 md:grid-cols-4">
            {OLD_TESTAMENT_BOOKS.map((book) => <BookButton key={book} book={book} />)}
          </div>
        </div>
        <div>
          <h3 className="mb-4 text-center text-xl font-semibold text-slate-200">신약 (27권)</h3>
          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-2 sm:grid-cols-3 md:grid-cols-4">
            {NEW_TESTAMENT_BOOKS.map((book) => <BookButton key={book} book={book} />)}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-700 pt-6">
        <div className="flex flex-col items-center justify-center gap-6">
          <div>
            <h4 className="mb-3 text-center text-lg font-semibold text-slate-200">AI 모델 선택</h4>
            <div className="flex flex-wrap justify-center gap-4">
              <button onClick={() => setSelectedAI('gemini')} className={`rounded-lg px-5 py-2 font-semibold transition-all ${selectedAI === 'gemini' ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}>Gemini</button>
              <button onClick={() => setSelectedAI('perplexity')} className={`rounded-lg px-5 py-2 font-semibold transition-all ${selectedAI === 'perplexity' ? 'bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}>Perplexity Sonar</button>
              <button onClick={() => setSelectedAI('chatgpt')} className={`rounded-lg px-5 py-2 font-semibold transition-all ${selectedAI === 'chatgpt' ? 'bg-teal-600 text-white ring-2 ring-teal-400' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}>ChatGPT 4o-mini</button>
            </div>
          </div>

          <div className="mx-auto mt-2 w-full max-w-lg">
            {selectedAI === 'gemini' && (
              <div className="rounded-lg border border-blue-800/50 bg-slate-900/50 p-4">
                <h5 className="mb-3 text-center font-semibold text-blue-300">Gemini 모델 선택</h5>
                <div className="text-sm text-slate-200">
                  모델 선택:
                  <select
                    value={selectedGeminiModel}
                    onChange={(e) => {
                      const nextModel = e.target.value;
                      setSelectedGeminiModel(nextModel);
                      setPreferredGeminiModel(nextModel);
                    }}
                    className="ml-2 rounded-md border border-slate-500 bg-slate-700 px-2 py-1 text-xs text-slate-100"
                  >
                    {GEMINI_ALLOWED_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  기본 추천은 Gemini 3.7 Flash입니다.
                </p>
              </div>
            )}
            {selectedAI === 'perplexity' && (
              <div className="rounded-lg border border-purple-800/50 bg-slate-900/50 p-4">
                <h5 className="mb-3 text-center font-semibold text-purple-300">Perplexity API 키 관리</h5>
                {perplexityKeyStatus === 'saved' ? (
                  <div className="flex items-center justify-between rounded-lg bg-slate-800 p-3">
                    <div className="flex items-center gap-2 text-green-400"><IconCheck className="h-5 w-5" /><span>API 키가 저장되었습니다.</span></div>
                    <div className="flex gap-2"><button onClick={() => { setPerplexityKeyStatus('editing'); setPerplexityApiKey(''); setPerplexityKeyError(null); }} className="rounded-md bg-slate-600 px-4 py-1 text-sm text-slate-300 hover:bg-slate-500">수정</button><button onClick={() => handleDeleteKey('perplexity')} className="rounded-md bg-red-700 px-4 py-1 text-sm text-white hover:bg-red-600">삭제</button></div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="password" value={perplexityApiKey} onChange={(e) => setPerplexityApiKey(e.target.value)} placeholder="pplx-..." className="w-full flex-1 rounded-md border border-slate-500 bg-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400" />
                      <button onClick={handleSavePerplexityKey} disabled={!perplexityApiKey || perplexityKeyStatus === 'saving'} className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-500 disabled:bg-slate-600">{perplexityKeyStatus === 'saving' ? '저장 중...' : '키 저장'}</button>
                    </div>
                    {perplexityKeyError && getApiErrorMessage(perplexityKeyError, () => setSelectedAI('gemini'), 'Perplexity')}
                  </>
                )}
              </div>
            )}
            {selectedAI === 'chatgpt' && (
              <div className="rounded-lg border border-teal-800/50 bg-slate-900/50 p-4">
                <h5 className="mb-3 text-center font-semibold text-teal-300">ChatGPT API 키 관리</h5>
                <div className="mb-3 text-sm text-slate-200">
                  모델 선택: 
                  <select
                    value={selectedChatGptModel}
                    onChange={(e) => {
                      const nextModel = e.target.value;
                      setSelectedChatGptModel(nextModel);
                      setPreferredChatGptModel(nextModel);
                    }}
                    className="ml-2 rounded-md border border-slate-500 bg-slate-700 px-2 py-1 text-xs text-slate-100"
                  >
                    {CHATGPT_ALLOWED_MODELS.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
                {chatGptKeyStatus === 'saved' ? (
                  <div className="flex items-center justify-between rounded-lg bg-slate-800 p-3">
                    <div className="flex items-center gap-2 text-green-400"><IconCheck className="h-5 w-5" /><span>API 키가 저장되었습니다.</span></div>
                    <div className="flex gap-2"><button onClick={() => { setChatGptKeyStatus('editing'); setChatGptApiKey(''); setChatGptKeyError(null); }} className="rounded-md bg-slate-600 px-4 py-1 text-sm text-slate-300 hover:bg-slate-500">수정</button><button onClick={() => handleDeleteKey('chatgpt')} className="rounded-md bg-red-700 px-4 py-1 text-sm text-white hover:bg-red-600">삭제</button></div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="password" value={chatGptApiKey} onChange={(e) => setChatGptApiKey(e.target.value)} placeholder="sk-..." className="w-full flex-1 rounded-md border border-slate-500 bg-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400" />
                      <button onClick={handleSaveGptKey} disabled={!chatGptApiKey || chatGptKeyStatus === 'saving'} className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-500 disabled:bg-slate-600">{chatGptKeyStatus === 'saving' ? '저장 중...' : '키 저장'}</button>
                    </div>
                    {chatGptKeyError && getApiErrorMessage(chatGptKeyError, () => setSelectedAI('gemini'), 'ChatGPT')}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="w-full max-w-lg">
            <p className="mb-2 text-sm font-semibold text-slate-300">원하는 구절 직접 선택 (선택)</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setIsDirectPickerOpen(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
              >
                구절 선택 메뉴 열기
              </button>
              {customReference && (
                <button
                  onClick={() => {
                    setCustomReference('');
                    setCustomReferenceError(null);
                  }}
                  className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-slate-100 hover:bg-slate-600"
                >
                  직접 선택 해제
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              직접 선택하면 책 선택보다 우선 적용됩니다.
            </p>
            {customReference && (
              <p className="mt-2 rounded-md bg-slate-900/60 px-3 py-2 text-sm text-blue-300">
                선택된 구절: {customReference}
              </p>
            )}
            {customReferenceError && <p className="mt-2 text-xs text-red-400">{customReferenceError}</p>}
          </div>

          <div className="mb-4 h-16 w-full text-center">
            {selectedStartBook && (
              <div className="mx-auto w-full max-w-sm rounded-lg bg-slate-900/50 p-3">
                <p className="mb-1 text-sm font-semibold text-slate-300">{selectedStartBook}</p>
                <p className="text-sm text-slate-400">{bookLastTopic ? `최근 학습: ${bookLastTopic}` : '아직 학습 기록이 없습니다.'}</p>
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
            <div className="relative flex-1" ref={generalInfoRef}>
              <button onClick={() => handleStart('general')} disabled={isGeneralStartDisabled} className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-8 py-3 font-bold text-white hover:bg-blue-500 disabled:bg-slate-600">
                <span>{selectedStartBook ? `${selectedStartBook} 일반 학습` : '일반 학습'}</span>
                <span onClick={(e) => { e.stopPropagation(); setShowGeneralInfo((s) => !s); }}><IconQuestionMark className="ml-2 h-5 w-5 text-blue-200" /></span>
              </button>
              {showGeneralInfo && <div className="absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left text-sm text-slate-300"><h5 className="mb-1 font-bold text-slate-100">일반 학습 모드</h5><p>관찰, 해석, 적용, 요약/표현 4단계 학습입니다.</p></div>}
            </div>
            <div className="relative flex-1" ref={advancedInfoRef}>
              <button onClick={() => handleStart('advanced')} disabled={isAdvancedStartDisabled} className="flex w-full items-center justify-center rounded-lg bg-slate-600 px-8 py-3 font-bold text-white hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500">
                <span>{selectedStartBook ? `${selectedStartBook} 심화 학습` : '심화 학습'}</span>
                <span onClick={(e) => { e.stopPropagation(); setShowAdvancedInfo((s) => !s); }}><IconQuestionMark className="ml-2 h-5 w-5 text-slate-400" /></span>
              </button>
              {showAdvancedInfo && <div className="absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left text-sm text-slate-300"><h5 className="mb-1 font-bold text-slate-100">심화 학습 모드</h5><p>변증과 표현을 위한 분석 중심 학습입니다.</p></div>}
            </div>
          </div>
        </div>
      </div>

      <CalvinChatModal
        isOpen={isCalvinChatOpen}
        onClose={() => setIsCalvinChatOpen(false)}
        aiModel={selectedAI}
        hasPerplexityKey={Boolean(profile?.perplexity_api_key)}
        hasChatGptKey={Boolean(profile?.chatgpt_api_key)}
      />
      <DirectVersePickerModal
        isOpen={isDirectPickerOpen}
        onClose={() => setIsDirectPickerOpen(false)}
        onSelect={(reference) => {
          setCustomReference(reference);
          setCustomReferenceError(null);
          setIsDirectPickerOpen(false);
        }}
      />
    </div>
  );
};

export default WelcomeScreen;
