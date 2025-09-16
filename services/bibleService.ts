import { supabase } from './supabaseClient';

interface ParsedReference {
  book: string;
  chapter: number;
  verses: number[];
}

interface BibleVerseResult {
  text: string | null;
  error: string | null;
}

/**
 * "잠언 1:1-7" → { book: "잠언", chapter: 1, verses: [1..7] }
 * "창세기 1:1" → { book: "창세기", chapter: 1, verses: [1] }
 */
function parseReference(reference: string): ParsedReference | null {
  const match = reference.match(/^([\uAC00-\uD7A3A-Za-z0-9]+)\s+(\d+):(\d+(?:-\d+)?)/);
  if (!match) return null;

  const book = match[1];
  const chapter = Number(match[2]);
  const versePart = match[3];

  let verses: number[] = [];
  if (versePart.includes('-')) {
    const [start, end] = versePart.split('-').map(v => Number(v));
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      verses = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  } else {
    const v = Number(versePart);
    if (!isNaN(v)) verses = [v];
  }

  return { book, chapter, verses };
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
