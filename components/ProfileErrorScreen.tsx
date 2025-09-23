import React, { useState } from 'react';

const RLSInstructions: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false); // RLS 가이드를 기본적으로 닫아둡니다.
    const codeSnippet = `
-- 1. "profiles" 테이블에 RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. SELECT 정책: 사용자는 자신의 프로필을 조회할 수 있습니다.
CREATE POLICY "Users can view their own profile."
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 3. INSERT 정책: 사용자는 자신의 프로필을 생성할 수 있습니다.
CREATE POLICY "Users can create their own profile."
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 4. UPDATE 정책: 사용자는 자신의 프로필을 수정할 수 있습니다.
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
    `.trim();

    return (
        <div className="text-left mt-6 border-t border-slate-700 pt-6">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-lg font-semibold text-slate-200 hover:text-white transition-colors">
                <span>Supabase RLS 정책 설정 가이드 (개발자용)</span>
                <span className="transform transition-transform">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
                <div className="mt-4 space-y-4 text-slate-300">
                    <p>
                        이 오류는 Supabase 데이터베이스의 'profiles' 테이블에 대한 RLS(행 수준 보안) 정책이 설정되지 않았을 때 주로 발생합니다.
                        아래 단계를 따라 정책을 설정해주세요.
                    </p>
                    <ol className="list-decimal list-inside space-y-2 pl-2">
                        <li>Supabase 프로젝트 대시보드로 이동하세요.</li>
                        <li>왼쪽 메뉴에서 'SQL Editor'를 선택하세요.</li>
                        <li>'+ New query'를 클릭하세요.</li>
                        <li>아래의 SQL 코드를 복사하여 붙여넣고 'RUN' 버튼을 클릭하세요.</li>
                    </ol>
                    <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                        <code>{codeSnippet}</code>
                    </pre>
                    <p>
                        정책을 적용한 후, 이 페이지를 새로고침하여 다시 시도해주세요.
                    </p>
                </div>
            )}
        </div>
    );
};

interface ProfileErrorScreenProps {
    error: string;
    onLogout: () => void;
}

const ProfileErrorScreen: React.FC<ProfileErrorScreenProps> = ({ error, onLogout }) => {
    const isRLSError = error.includes('RLS') || error.includes('시간 초과');

    return (
        <div className="text-center bg-slate-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-red-400 mb-4">
                {isRLSError ? "인증 문제 발생" : "프로필 로딩 실패"}
            </h2>

            {isRLSError ? (
                <p className="text-slate-300 text-lg mb-8">
                    가입자 인증에 문제가 발생하였습니다. 재로그인하여 주시길 바랍니다.
                </p>
            ) : (
                <>
                    <pre className="text-slate-300 text-left bg-slate-900/50 p-4 rounded-md font-mono text-sm mb-6 whitespace-pre-wrap">{error}</pre>
                    <p className="text-slate-400 text-sm mb-6">
                        위의 문제를 해결한 후, 페이지를 새로고침하여 다시 시도해주세요. 또는 로그아웃할 수 있습니다.
                    </p>
                </>
            )}

            <button
                onClick={onLogout}
                className="w-full px-8 py-3 bg-slate-600 text-white font-bold rounded-lg shadow-lg hover:bg-slate-500 transition-all"
            >
                {isRLSError ? "확인" : "로그아웃"}
            </button>
            
            {isRLSError && <RLSInstructions />}
        </div>
    );
};

export default ProfileErrorScreen;