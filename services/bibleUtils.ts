
export interface ParsedReference {
  book: string;
  chapter: number;
  verses: number[];
}

/**
 * Parses a Bible reference string into a structured object.
 * Handles references like "창세기 1:1-5", "요한1서 1:1", "요한복음 3:16".
 * @param reference The Bible reference string.
 * @returns A ParsedReference object or null if parsing fails.
 */
export function parseReference(reference: string | null | undefined): ParsedReference | null {
  if (!reference || typeof reference !== 'string') return null;
  
  // '요한1서'와 같이 숫자가 포함된 책 이름도 처리합니다.
  const match = reference.trim().match(/^([\uAC00-\uD7A3A-Za-z0-9]+)\s+(\d+):(\d+(?:-\d+)?)/);
  if (!match) return null;

  const book = match[1];
  const chapter = parseInt(match[2], 10);
  const versePart = match[3];

  let verses: number[] = [];
  if (versePart.includes('-')) {
    const [start, end] = versePart.split('-').map(v => parseInt(v, 10));
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      verses = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  } else {
    const v = parseInt(versePart, 10);
    if (!isNaN(v)) verses = [v];
  }

  if (isNaN(chapter) || verses.length === 0) return null;

  return { book, chapter, verses };
}
