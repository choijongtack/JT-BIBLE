// services/encryptionService.ts

// 이 서비스는 Web Crypto API를 사용하여 텍스트를 암호화하고 복호화합니다.
// 암호화 키는 사용자의 Supabase 액세스 토큰에서 안전하게 파생됩니다.
// 이는 데이터베이스에 저장된 API 키가 해당 사용자의 활성 세션 없이는
// 해독될 수 없도록 보장합니다.

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // AES-GCM에 권장되는 길이

/**
 * Supabase 액세스 토큰을 SHA-256으로 해시하여 암호화에 사용할 수 있는 CryptoKey로 변환합니다.
 * @param {string} token - Supabase 세션의 액세스 토큰.
 * @returns {Promise<CryptoKey>} - 암호화 작업을 위한 CryptoKey.
 */
const getKey = async (token: string): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(token);
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    return await crypto.subtle.importKey(
        'raw',
        hash,
        { name: ALGORITHM },
        false,
        ['encrypt', 'decrypt']
    );
};

/**
 * 텍스트를 사용자의 액세스 토큰으로 암호화합니다.
 * @param {string} text - 암호화할 평문.
 * @param {string} token - 암호화 키를 파생시키는 데 사용할 Supabase 액세스 토큰.
 * @returns {Promise<string>} - Base64로 인코딩된 암호화된 문자열.
 */
export const encrypt = async (text: string, token: string): Promise<string> => {
    const key = await getKey(token);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);

    const encryptedData = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encodedText
    );

    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    // btoa를 사용하여 이진 데이터를 Base64로 인코딩합니다.
    return btoa(String.fromCharCode(...combined));
};

/**
 * 암호화된 Base64 문자열을 사용자의 액세스 토큰으로 복호화합니다.
 * @param {string} encryptedBase64 - 복호화할 Base64 인코딩된 문자열.
 * @param {string} token - 복호화 키를 파생시키는 데 사용할 Supabase 액세스 토큰.
 * @returns {Promise<string>} - 복호화된 평문.
 */
export const decrypt = async (encryptedBase64: string, token: string): Promise<string> => {
    try {
        const key = await getKey(token);
        // atob를 사용하여 Base64를 이진 문자열로 디코딩합니다.
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        
        const iv = combined.slice(0, IV_LENGTH);
        const encryptedData = combined.slice(IV_LENGTH);

        const decryptedData = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv },
            key,
            encryptedData
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    } catch (error) {
        console.error("복호화 실패:", error);
        throw new Error("API 키를 복호화하지 못했습니다. 토큰이 만료되었거나 데이터가 손상되었을 수 있습니다.");
    }
};
