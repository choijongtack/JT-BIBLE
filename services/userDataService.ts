import type { LearningSessionState } from '../types';

export interface UserProgress {
    [book: string]: string[]; // e.g., { "에베소서": ["에베소서 1:1-14", "에베소서 1:15-23"] }
}

export interface UserData {
    passwordHash: string; // FAKE HASH - NOT FOR PRODUCTION
    progress: UserProgress;
    activeLearningSession: LearningSessionState | null;
}

const STORAGE_KEY = 'bibleStudyApp_users_db';

// A mock database using localStorage
const getDb = (): Record<string, UserData> => {
    try {
        const dbString = localStorage.getItem(STORAGE_KEY);
        return dbString ? JSON.parse(dbString) : {};
    } catch (e) {
        console.error("Failed to read from localStorage", e);
        return {};
    }
};

const saveDb = (db: Record<string, UserData>) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
        console.error("Failed to write to localStorage", e);
    }
};

// IMPORTANT: This is a fake hash for demonstration purposes ONLY.
// In a real application, use a strong, salted hashing algorithm like bcrypt.
const fakeHash = (password: string): string => {
    return `hashed_${password}_salted`;
};


export const registerUser = (email: string, password: string): UserData => {
    if (!email || !password) {
        throw new Error("이메일과 비밀번호를 모두 입력해주세요.");
    }
    const db = getDb();
    if (db[email]) {
        throw new Error("이미 존재하는 이메일입니다.");
    }

    const newUser: UserData = {
        passwordHash: fakeHash(password),
        progress: {},
        activeLearningSession: null,
    };

    db[email] = newUser;
    saveDb(db);
    return newUser;
};

export const loginUser = (email: string, password: string): UserData => {
    const db = getDb();
    const user = db[email];

    if (!user) {
        throw new Error("존재하지 않는 사용자입니다.");
    }
    if (user.passwordHash !== fakeHash(password)) {
        throw new Error("비밀번호가 올바르지 않습니다.");
    }
    return user;
};


export const getUserData = (email: string): UserData | null => {
    if (!email) return null;
    const db = getDb();
    return db[email] || null;
};

export const updateUserProgress = (email: string, book: string, newTopic: string) => {
    if (!email || !book || !newTopic) return;
    
    const db = getDb();
    const user = db[email];
    if (!user) return;
    
    if (!user.progress[book]) {
        user.progress[book] = [];
    }
    
    if (!user.progress[book].includes(newTopic)) {
        user.progress[book].push(newTopic);
    }
    
    saveDb(db);
};

export const saveActiveSession = (email: string, session: LearningSessionState | null) => {
    if (!email) return;
    const db = getDb();
    const user = db[email];
    if (user) {
        user.activeLearningSession = session;
        saveDb(db);
    }
};