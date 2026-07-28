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
    .map((i: unknown) => {
      const item = i as Partial<WebSearchItem>;
      return ({
      title: String(item.title || ''),
      url: String(item.url || ''),
      snippet: String(item.snippet || ''),
    });
    })
    .filter((i: WebSearchItem) => i.title || i.url || i.snippet);
};

export const buildWebSourcesBlock = (sources: WebSearchItem[]): string => {
  if (!sources.length) return '';
  return sources
    .map((s, idx) => `(${idx + 1}) ${s.title}\nURL: ${s.url}\n요약: ${s.snippet}`)
    .join('\n\n');
};
