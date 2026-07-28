import type { UserProgress } from '../types';
import type { CompletedPassage } from './userDataService';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '../constants';

export interface BookData {
  totalVerses: number;
}

export interface BookMetadata {
  chapters: number;
  versesInLastChapter: number;
}

const OLD_TESTAMENT_METADATA: Array<[number, number]> = [
  [50, 26], [40, 38], [27, 34], [36, 13], [34, 12], [24, 33], [21, 25], [4, 22], [31, 13], [24, 25],
  [22, 53], [25, 30], [29, 30], [36, 23], [10, 44], [13, 31], [10, 3], [42, 17], [150, 6], [31, 31],
  [12, 14], [8, 14], [66, 24], [52, 34], [5, 22], [48, 35], [12, 13], [14, 9], [3, 21], [9, 15],
  [1, 21], [4, 11], [7, 20], [3, 19], [3, 19], [3, 20], [2, 23], [14, 21], [4, 6],
];

const NEW_TESTAMENT_METADATA: Array<[number, number]> = [
  [28, 20], [16, 20], [24, 53], [21, 25], [28, 31], [16, 27], [16, 24], [13, 13], [6, 18],
  [6, 24], [4, 23], [4, 18], [5, 28], [3, 18], [6, 21], [4, 22], [3, 15], [1, 25], [13, 25],
  [5, 20], [5, 14], [3, 18], [5, 21], [1, 13], [1, 15], [1, 25], [22, 21],
];

const OLD_TESTAMENT_VERSE_TOTALS = [
  1533, 1213, 859, 1288, 959, 658, 618, 85, 809, 695,
  816, 719, 942, 822, 280, 406, 167, 1070, 2460, 915,
  222, 117, 1292, 1364, 154, 1273, 357, 197, 73, 146,
  21, 48, 105, 47, 56, 53, 38, 211, 55,
];

const NEW_TESTAMENT_VERSE_TOTALS = [
  1071, 678, 1151, 879, 1007, 433, 437, 256, 149,
  155, 104, 95, 89, 47, 113, 83, 46, 25, 303,
  108, 105, 61, 105, 13, 15, 25, 404,
];

export const BIBLE_METADATA: Record<string, BookMetadata> = Object.fromEntries([
  ...OLD_TESTAMENT_BOOKS.map((book, index) => {
    const [chapters, versesInLastChapter] = OLD_TESTAMENT_METADATA[index];
    return [book, { chapters, versesInLastChapter }];
  }),
  ...NEW_TESTAMENT_BOOKS.map((book, index) => {
    const [chapters, versesInLastChapter] = NEW_TESTAMENT_METADATA[index];
    return [book, { chapters, versesInLastChapter }];
  }),
]);

export const BIBLE_BOOK_DATA: Record<string, BookData> = Object.fromEntries([
  ...OLD_TESTAMENT_BOOKS.map((book, index) => [book, { totalVerses: OLD_TESTAMENT_VERSE_TOTALS[index] }]),
  ...NEW_TESTAMENT_BOOKS.map((book, index) => [book, { totalVerses: NEW_TESTAMENT_VERSE_TOTALS[index] }]),
]);

export const calculateVerseProgressForList = (
  progress: UserProgress | null | undefined,
  books: string[],
  completedPassages?: CompletedPassage[] | null,
): { completed: number; total: number } => {
  let completedVerses = 0;
  let totalVerses = 0;

  books.forEach((bookName) => {
    if (BIBLE_BOOK_DATA[bookName]) {
      totalVerses += BIBLE_BOOK_DATA[bookName].totalVerses;
    }
  });

  if (completedPassages) {
    const coveredVerses = new Set<string>();
    completedPassages.forEach(passage => {
      if (!books.includes(passage.book)) return;
      for (let verse = passage.startVerse; verse <= passage.endVerse; verse += 1) {
        coveredVerses.add(`${passage.book}:${passage.chapter}:${verse}`);
      }
    });
    return { completed: coveredVerses.size, total: totalVerses };
  }

  if (!progress) {
    return { completed: 0, total: totalVerses };
  }

  Object.keys(progress).forEach((bookName) => {
    if (books.includes(bookName)) {
      const bookProgress = progress[bookName];
      if (bookProgress && bookProgress.totalCompletedVerses) {
        completedVerses += bookProgress.totalCompletedVerses;
      }
    }
  });

  return { completed: completedVerses, total: totalVerses };
};

export const getStudiedBookCountForList = (progress: UserProgress | null | undefined, books: string[]): number => {
  if (!progress) return 0;

  return books.reduce((count, book) => {
    if (progress[book] && progress[book]?.completionMarker) {
      return count + 1;
    }
    return count;
  }, 0);
};
