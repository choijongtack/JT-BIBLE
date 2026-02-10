import { supabase } from './supabaseClient';

export interface CalvinChunk {
  id: string;
  page_from: number;
  page_to: number;
  content: string;
  rank: number;
}

const HANGUL_REGEX = /[가-힣]/;
const GEMINI_PROXY_FUNCTION_NAME = 'gemini-proxy';

const extractGeminiText = (data: any): string | null => {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
};

export const translateKoreanQueryToEnglish = async (queryText: string): Promise<string> => {
  if (!HANGUL_REGEX.test(queryText)) return queryText;

  const prompt = [
    'Translate the Korean query into concise theological English keywords for document retrieval.',
    'Output only one line of English text, no quotes, no markdown.',
    `Korean query: ${queryText}`,
  ].join('\n');

  const { data, error } = await supabase.functions.invoke(GEMINI_PROXY_FUNCTION_NAME, {
    body: {
      payload: {
        contents: [{ parts: [{ text: prompt }] }],
      },
    },
  });

  if (error) {
    console.warn('Korean->English translation failed:', error.message);
    return queryText;
  }

  const translated = extractGeminiText(data);
  if (!translated) return queryText;
  return translated.trim();
};

export const searchCalvinChunks = async (queryText: string, matchCount = 3): Promise<CalvinChunk[]> => {
  const q = queryText.trim();
  if (!q) return [];
  const translatedQuery = await translateKoreanQueryToEnglish(q);

  const { data, error } = await supabase.rpc('search_calvin_chunks', {
    query_text: translatedQuery,
    match_count: matchCount,
  });

  if (error) {
    console.warn('search_calvin_chunks failed:', error.message);
    return [];
  }

  return (data || []) as CalvinChunk[];
};

export const searchCalvinChunksWithTranslation = async (
  queryText: string,
  matchCount = 5
): Promise<{ translatedQuery: string; chunks: CalvinChunk[] }> => {
  const q = queryText.trim();
  if (!q) return { translatedQuery: '', chunks: [] };

  const translatedQuery = await translateKoreanQueryToEnglish(q);
  const { data, error } = await supabase.rpc('search_calvin_chunks', {
    query_text: translatedQuery,
    match_count: matchCount,
  });

  if (error) {
    console.warn('search_calvin_chunks failed:', error.message);
    return { translatedQuery, chunks: [] };
  }

  return { translatedQuery, chunks: (data || []) as CalvinChunk[] };
};

export const buildCalvinContextBlock = (chunks: CalvinChunk[]): string => {
  if (!chunks.length) return '';
  const lines = chunks.map((c, idx) => {
    const pageRef = c.page_from === c.page_to ? `p.${c.page_from}` : `p.${c.page_from}-${c.page_to}`;
    return `[${idx + 1}] (${pageRef}) ${c.content}`;
  });

  return [
    '[기독교 강요 검색 근거]',
    ...lines,
    '',
    '[응답 규칙]',
    '- 위 근거를 우선 사용하세요.',
    '- 신학적 주장 문장에는 반드시 [기독교강요 p.xxx] 또는 [Inst.x.x.x]를 붙이세요.',
  ].join('\n');
};

