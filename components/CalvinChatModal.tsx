import React, { useMemo, useState } from 'react';
import type { AiModel } from '../types';
import { getCalvinInterpretationFromWeb } from '../services/perplexityService';
import { getCalvinInterpretationFromGemini } from '../services/geminiService';
import { getCalvinInterpretationFromChatGpt } from '../services/chatgptService';
import { searchCalvinChunksWithTranslation } from '../services/calvinCitationService';
import { buildWebSourcesBlock, searchInterpretationWeb } from '../services/webSearchService';

type CalvinMessage = {
  role: 'user' | 'assistant';
  question?: string;
  translatedQuery?: string;
  originalText?: string;
  interpretationText?: string;
  webSourcesText?: string;
};

interface CalvinChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiModel: AiModel;
  hasPerplexityKey: boolean;
  hasChatGptKey: boolean;
}

const splitSections = (text: string): { originalText: string; interpretationText: string } => {
  const originalMatch = text.match(/원본 내용:\s*([\s\S]*?)(?:해석 내용:|$)/);
  const interpretationMatch = text.match(/해석 내용:\s*([\s\S]*)$/);
  return {
    originalText: originalMatch?.[1]?.trim() || '',
    interpretationText: interpretationMatch?.[1]?.trim() || '',
  };
};

const getModelLabel = (aiModel: AiModel): string => {
  switch (aiModel) {
    case 'chatgpt': return 'ChatGPT';
    case 'perplexity': return 'Perplexity';
    default: return 'Gemini';
  }
};

const CalvinChatModal: React.FC<CalvinChatModalProps> = ({
  isOpen,
  onClose,
  aiModel,
  hasPerplexityKey,
  hasChatGptKey,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<CalvinMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const disabledReason = useMemo(() => {
    if (aiModel === 'perplexity' && !hasPerplexityKey) {
      return 'Perplexity API 키가 필요합니다. 메인 화면에서 키를 저장해 주세요.';
    }
    if (aiModel === 'chatgpt' && !hasChatGptKey) {
      return 'ChatGPT API 키가 필요합니다. 메인 화면에서 키를 저장해 주세요.';
    }
    return null;
  }, [aiModel, hasPerplexityKey, hasChatGptKey]);

  if (!isOpen) return null;

  const askByModel = async (
    question: string,
    translatedQuery: string,
    chunks: { page_from: number; page_to: number; content: string }[],
    webSourcesText: string
  ): Promise<string> => {
    switch (aiModel) {
      case 'perplexity':
        return getCalvinInterpretationFromWeb(question, translatedQuery, chunks);
      case 'chatgpt':
        return getCalvinInterpretationFromChatGpt(question, translatedQuery, chunks, webSourcesText);
      default:
        return getCalvinInterpretationFromGemini(question, translatedQuery, chunks, webSourcesText);
    }
  };

  const handleAsk = async () => {
    const question = input.trim();
    if (!question || isLoading || disabledReason) return;

    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', question }]);
    setInput('');

    try {
      const { translatedQuery, chunks } = await searchCalvinChunksWithTranslation(question, 5);
      const interpretationQuery = `${translatedQuery} Calvin Institutes commentary interpretation theology`;
      const webSources = await searchInterpretationWeb(interpretationQuery, 5);
      const webSourcesText = buildWebSourcesBlock(webSources);
      const aiText = await askByModel(question, translatedQuery, chunks, webSourcesText);
      const parsed = splitSections(aiText);

      const fallbackOriginal = chunks
        .slice(0, 3)
        .map((c) => `p.${c.page_from}${c.page_from === c.page_to ? '' : `-${c.page_to}`}\n${c.content}`)
        .join('\n\n');

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          translatedQuery,
          originalText: parsed.originalText || fallbackOriginal || '(검색된 원문이 없습니다)',
          interpretationText: parsed.interpretationText || aiText,
          webSourcesText,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '기독교 강요 검색 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-100">
            존 칼뱅의 기독교 강요 ({getModelLabel(aiModel)})
          </h3>
          <button onClick={onClose} className="px-3 py-1 rounded bg-slate-700 text-slate-200 hover:bg-slate-600">
            닫기
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-slate-400">
              질문 예시: "칭의와 성화의 관계를 설명해줘"
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'user' ? (
                <div className="max-w-xl bg-blue-600 text-white rounded-2xl rounded-br-lg px-4 py-3 whitespace-pre-wrap">
                  {m.question}
                </div>
              ) : (
                <div className="w-full max-w-3xl bg-slate-800 text-slate-100 rounded-2xl rounded-bl-lg px-4 py-3 border border-slate-700">
                  <div className="text-xs text-slate-400 mb-2">
                    변환 검색어: {m.translatedQuery || '-'}
                  </div>
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-emerald-300 mb-1">원본 내용</div>
                    <div className="text-sm whitespace-pre-wrap text-slate-200">{m.originalText}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber-300 mb-1">해석 내용</div>
                    <div className="text-sm whitespace-pre-wrap text-slate-200">{m.interpretationText}</div>
                  </div>
                  {m.webSourcesText && (
                    <details className="mt-3">
                      <summary className="text-xs text-slate-400 cursor-pointer">웹 해석 출처 보기</summary>
                      <pre className="mt-2 text-xs whitespace-pre-wrap text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-700">
                        {m.webSourcesText}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && <div className="text-sm text-slate-400">검색 및 해석 중...</div>}
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-700">
          {disabledReason ? (
            <div className="text-sm text-yellow-300 bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
              {disabledReason}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
                placeholder="기독교 강요 관련 질문을 입력하세요"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
              <button
                onClick={handleAsk}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400"
              >
                질문
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalvinChatModal;
