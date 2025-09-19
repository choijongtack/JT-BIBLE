import type { UserProgress } from '../types';
import { parseReference } from './bibleUtils';

export interface BookData {
    totalVerses: number;
}

export interface BookMetadata {
  chapters: number;
  versesInLastChapter: number;
}

export const BIBLE_METADATA: Record<string, BookMetadata> = {
    // 구약
    '창세기': { chapters: 50, versesInLastChapter: 26 }, '출애굽기': { chapters: 40, versesInLastChapter: 38 }, '레위기': { chapters: 27, versesInLastChapter: 34 }, '민수기': { chapters: 36, versesInLastChapter: 13 }, '신명기': { chapters: 34, versesInLastChapter: 12 }, '여호수아': { chapters: 24, versesInLastChapter: 33 }, '사사기': { chapters: 21, versesInLastChapter: 25 }, '룻기': { chapters: 4, versesInLastChapter: 22 }, '사무엘상': { chapters: 31, versesInLastChapter: 13 }, '사무엘하': { chapters: 24, versesInLastChapter: 25 }, '열왕기상': { chapters: 22, versesInLastChapter: 53 }, '열왕기하': { chapters: 25, versesInLastChapter: 30 }, '역대상': { chapters: 29, versesInLastChapter: 30 }, '역대하': { chapters: 36, versesInLastChapter: 23 }, '에스라': { chapters: 10, versesInLastChapter: 44 }, '느헤미야': { chapters: 13, versesInLastChapter: 31 }, '에스더': { chapters: 10, versesInLastChapter: 3 }, '욥기': { chapters: 42, versesInLastChapter: 17 }, '시편': { chapters: 150, versesInLastChapter: 6 }, '잠언': { chapters: 31, versesInLastChapter: 31 }, '전도서': { chapters: 12, versesInLastChapter: 14 }, '아가': { chapters: 8, versesInLastChapter: 14 }, '이사야': { chapters: 66, versesInLastChapter: 24 }, '예레미야': { chapters: 52, versesInLastChapter: 34 }, '예레미야애가': { chapters: 5, versesInLastChapter: 22 }, '에스겔': { chapters: 48, versesInLastChapter: 35 }, '다니엘': { chapters: 12, versesInLastChapter: 13 }, '호세아': { chapters: 14, versesInLastChapter: 9 }, '요엘': { chapters: 3, versesInLastChapter: 21 }, '아모스': { chapters: 9, versesInLastChapter: 15 }, '오바댜': { chapters: 1, versesInLastChapter: 21 }, '요나': { chapters: 4, versesInLastChapter: 11 }, '미가': { chapters: 7, versesInLastChapter: 20 }, '나훔': { chapters: 3, versesInLastChapter: 19 }, '하박국': { chapters: 3, versesInLastChapter: 19 }, '스바냐': { chapters: 3, versesInLastChapter: 20 }, '학개': { chapters: 2, versesInLastChapter: 23 }, '스가랴': { chapters: 14, versesInLastChapter: 21 }, '말라기': { chapters: 4, versesInLastChapter: 6 },
    // 신약
    '마태복음': { chapters: 28, versesInLastChapter: 20 }, '마가복음': { chapters: 16, versesInLastChapter: 20 }, '누가복음': { chapters: 24, versesInLastChapter: 53 }, '요한복음': { chapters: 21, versesInLastChapter: 25 }, '사도행전': { chapters: 28, versesInLastChapter: 31 }, '로마서': { chapters: 16, versesInLastChapter: 27 }, '고린도전서': { chapters: 16, versesInLastChapter: 24 }, '고린도후서': { chapters: 13, versesInLastChapter: 13 }, '갈라디아서': { chapters: 6, versesInLastChapter: 18 }, '에베소서': { chapters: 6, versesInLastChapter: 24 }, '빌립보서': { chapters: 4, versesInLastChapter: 23 }, '골로새서': { chapters: 4, versesInLastChapter: 18 }, '데살로니가전서': { chapters: 5, versesInLastChapter: 28 }, '데살로니가후서': { chapters: 3, versesInLastChapter: 18 }, '디모데전서': { chapters: 6, versesInLastChapter: 21 }, '디모데후서': { chapters: 4, versesInLastChapter: 22 }, '디도서': { chapters: 3, versesInLastChapter: 15 }, '빌레몬서': { chapters: 1, versesInLastChapter: 25 }, '히브리서': { chapters: 13, versesInLastChapter: 25 }, '야고보서': { chapters: 5, versesInLastChapter: 20 }, '베드로전서': { chapters: 5, versesInLastChapter: 14 }, '베드로후서': { chapters: 3, versesInLastChapter: 18 }, '요한1서': { chapters: 5, versesInLastChapter: 21 }, '요한2서': { chapters: 1, versesInLastChapter: 13 }, '요한3서': { chapters: 1, versesInLastChapter: 15 }, '유다서': { chapters: 1, versesInLastChapter: 25 }, '요한계시록': { chapters: 22, versesInLastChapter: 21 }
};

export const BIBLE_BOOK_DATA: Record<string, BookData> = {
    // 구약
    '창세기': { totalVerses: 1533 }, '출애굽기': { totalVerses: 1213 }, '레위기': { totalVerses: 859 }, '민수기': { totalVerses: 1288 }, '신명기': { totalVerses: 959 }, '여호수아': { totalVerses: 658 }, '사사기': { totalVerses: 618 }, '룻기': { totalVerses: 85 }, '사무엘상': { totalVerses: 810 }, '사무엘하': { totalVerses: 695 }, '열왕기상': { totalVerses: 816 }, '열왕기하': { totalVerses: 719 }, '역대상': { totalVerses: 942 }, '역대하': { totalVerses: 822 }, '에스라': { totalVerses: 280 }, '느헤미야': { totalVerses: 406 }, '에스더': { totalVerses: 167 }, '욥기': { totalVerses: 1070 }, '시편': { totalVerses: 2461 }, '잠언': { totalVerses: 915 }, '전도서': { totalVerses: 222 }, '아가': { totalVerses: 117 }, '이사야': { totalVerses: 1292 }, '예레미야': { totalVerses: 1364 }, '예레미야애가': { totalVerses: 154 }, '에스겔': { totalVerses: 1273 }, '다니엘': { totalVerses: 357 }, '호세아': { totalVerses: 197 }, '요엘': { totalVerses: 73 }, '아모스': { totalVerses: 146 }, '오바댜': { totalVerses: 21 }, '요나': { totalVerses: 48 }, '미가': { totalVerses: 105 }, '나훔': { totalVerses: 47 }, '하박국': { totalVerses: 56 }, '스바냐': { totalVerses: 53 }, '학개': { totalVerses: 38 }, '스가랴': { totalVerses: 211 }, '말라기': { totalVerses: 55 },
    // 신약
    '마태복음': { totalVerses: 1071 }, '마가복음': { totalVerses: 678 }, '누가복음': { totalVerses: 1151 }, '요한복음': { totalVerses: 879 }, '사도행전': { totalVerses: 1007 }, '로마서': { totalVerses: 433 }, '고린도전서': { totalVerses: 437 }, '고린도후서': { totalVerses: 257 }, '갈라디아서': { totalVerses: 149 }, '에베소서': { totalVerses: 155 }, '빌립보서': { totalVerses: 104 }, '골로새서': { totalVerses: 95 }, '데살로니가전서': { totalVerses: 89 }, '데살로니가후서': { totalVerses: 47 }, '디모데전서': { totalVerses: 113 }, '디모데후서': { totalVerses: 83 }, '디도서': { totalVerses: 46 }, '빌레몬서': { totalVerses: 25 }, '히브리서': { totalVerses: 303 }, '야고보서': { totalVerses: 108 }, '베드로전서': { totalVerses: 105 }, '베드로후서': { totalVerses: 61 }, '요한1서': { totalVerses: 105 }, '요한2서': { totalVerses: 13 }, '요한3서': { totalVerses: 15 }, '유다서': { totalVerses: 25 }, '요한계시록': { totalVerses: 404 }
};

export const calculateVerseProgressForList = (progress: UserProgress | null | undefined, books: string[]): { completed: number; total: number } => {
    let completedVerses = 0;
    let totalVerses = 0;

    books.forEach(bookName => {
        if (BIBLE_BOOK_DATA[bookName]) {
            totalVerses += BIBLE_BOOK_DATA[bookName].totalVerses;
        }
    });

    if (!progress) {
        return { completed: 0, total: totalVerses };
    }

    Object.keys(progress).forEach(bookName => {
        if (books.includes(bookName)) {
            const bookProgress = progress[bookName];
            if (bookProgress && Array.isArray(bookProgress.completedTopics)) {
                const uniqueTopics = new Set(bookProgress.completedTopics);
                uniqueTopics.forEach(topic => {
                    const parsed = parseReference(topic);
                    // If parsing fails, count as 0, otherwise count verses.
                    completedVerses += parsed ? parsed.verses.length : 0;
                });
            }
        }
    });
    
    return { completed: completedVerses, total: totalVerses };
};

export const getStudiedBookCountForList = (progress: UserProgress | null | undefined, books: string[]): number => {
    if (!progress) return 0;
    
    return books.reduce((count, book) => {
        if (progress[book] && progress[book]?.completedTopics?.length > 0) {
            return count + 1;
        }
        return count;
    }, 0);
};