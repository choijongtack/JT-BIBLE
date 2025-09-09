import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '../constants';
import type { UserProgress } from '../types';

export interface BookData {
    totalVerses: number;
}

export const BIBLE_BOOK_DATA: Record<string, BookData> = {
    // 구약
    '창세기': { totalVerses: 1533 }, '출애굽기': { totalVerses: 1213 }, '레위기': { totalVerses: 859 }, '민수기': { totalVerses: 1288 }, '신명기': { totalVerses: 959 }, '여호수아': { totalVerses: 658 }, '사사기': { totalVerses: 618 }, '룻기': { totalVerses: 85 }, '사무엘상': { totalVerses: 810 }, '사무엘하': { totalVerses: 695 }, '열왕기상': { totalVerses: 816 }, '열왕기하': { totalVerses: 719 }, '역대상': { totalVerses: 942 }, '역대하': { totalVerses: 822 }, '에스라': { totalVerses: 280 }, '느헤미야': { totalVerses: 406 }, '에스더': { totalVerses: 167 }, '욥기': { totalVerses: 1070 }, '시편': { totalVerses: 2461 }, '잠언': { totalVerses: 915 }, '전도서': { totalVerses: 222 }, '아가': { totalVerses: 117 }, '이사야': { totalVerses: 1292 }, '예레미야': { totalVerses: 1364 }, '예레미야애가': { totalVerses: 154 }, '에스겔': { totalVerses: 1273 }, '다니엘': { totalVerses: 357 }, '호세아': { totalVerses: 197 }, '요엘': { totalVerses: 73 }, '아모스': { totalVerses: 146 }, '오바댜': { totalVerses: 21 }, '요나': { totalVerses: 48 }, '미가': { totalVerses: 105 }, '나훔': { totalVerses: 47 }, '하박국': { totalVerses: 56 }, '스바냐': { totalVerses: 53 }, '학개': { totalVerses: 38 }, '스가랴': { totalVerses: 211 }, '말라기': { totalVerses: 55 },
    // 신약
    '마태복음': { totalVerses: 1071 }, '마가복음': { totalVerses: 678 }, '누가복음': { totalVerses: 1151 }, '요한복음': { totalVerses: 879 }, '사도행전': { totalVerses: 1007 }, '로마서': { totalVerses: 433 }, '고린도전서': { totalVerses: 437 }, '고린도후서': { totalVerses: 257 }, '갈라디아서': { totalVerses: 149 }, '에베소서': { totalVerses: 155 }, '빌립보서': { totalVerses: 104 }, '골로새서': { totalVerses: 95 }, '데살로니가전서': { totalVerses: 89 }, '데살로니가후서': { totalVerses: 47 }, '디모데전서': { totalVerses: 113 }, '디모데후서': { totalVerses: 83 }, '디도서': { totalVerses: 46 }, '빌레몬서': { totalVerses: 25 }, '히브리서': { totalVerses: 303 }, '야고보서': { totalVerses: 108 }, '베드로전서': { totalVerses: 105 }, '베드로후서': { totalVerses: 61 }, '요한1서': { totalVerses: 105 }, '요한2서': { totalVerses: 13 }, '요한3서': { totalVerses: 14 }, '유다서': { totalVerses: 25 }, '요한계시록': { totalVerses: 404 }
};

export const getStudiedBookCountForList = (progress: UserProgress | null | undefined, books: string[]): number => {
    if (!progress) return 0;
    
    return books.reduce((count, book) => {
        // If there's an entry for the book (a last studied topic string), it counts as studied.
        if (progress[book]) {
            return count + 1;
        }
        return count;
    }, 0);
};
