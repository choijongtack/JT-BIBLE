import { supabase } from './supabaseClient';
import { parseReference } from './bibleUtils';

interface BibleVerseResult {
  text: string | null;
  error: string | null;
}

/**
 * DB에서 성경 구절 가져오기
 * - 성공: { text: "본문", error: null }
 * - 실패: { text: null, error: "에러 메시지" }
 */
export async function getBibleVerse(reference: string): Promise<BibleVerseResult> {
  try {
    const parsed = parseReference(reference);
    if (!parsed) {
      return { text: null, error: `Invalid reference format: ${reference}` };
    }

    const { book, chapter, verses } = parsed;

    let query = supabase
      .from("verses")
      .select("chapter, verse, text")
      .eq("book", book)
      .eq("chapter", chapter)
      .order("verse", { ascending: true });

    if (verses.length === 1) {
      query = query.eq("verse", verses[0]);
    } else if (verses.length > 1) {
      query = query.in("verse", verses);
    }

    const { data, error } = await query;

    if (error) {
      return { text: null, error: error.message };
    }

    if (!data || data.length === 0) {
      return { text: null, error: `No verses found for ${reference}` };
    }

    const text = data.map(v => `${v.chapter}:${v.verse} ${v.text}`).join("\n");
    return { text, error: null };
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
