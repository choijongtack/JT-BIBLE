import { supabase } from './supabaseClient';

export interface WebSearchItem {
  title: string;
  url: string;
  snippet: string;
}

export const searchInterpretationWeb = async (
  query: string,
  numResults = 5
): Promise<WebSearchItem[]> => {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase.functions.invoke('web-search-proxy', {
    body: { query: q, numResults },
  });

  if (error) {
    console.warn('web-search-proxy invoke failed:', error.message);
    return [];
  }

  const items = Array.isArray(data?.results) ? data.results : [];
  return items
    .map((i: any) => ({
      title: String(i?.title || ''),
      url: String(i?.url || ''),
      snippet: String(i?.snippet || ''),
    }))
    .filter((i: WebSearchItem) => i.title || i.url || i.snippet);
};

export const buildWebSourcesBlock = (sources: WebSearchItem[]): string => {
  if (!sources.length) return '';
  return sources
    .map((s, idx) => `(${idx + 1}) ${s.title}\nURL: ${s.url}\n요약: ${s.snippet}`)
    .join('\n\n');
};

