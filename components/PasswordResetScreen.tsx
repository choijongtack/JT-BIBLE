import React, { useState } from 'react';

interface Props {
  onSubmit: (password: string) => Promise<void>;
  onBack: () => void;
}

const PasswordResetScreen: React.FC<Props> = ({ onSubmit, onBack }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');
    if (password !== confirm) return setError('비밀번호가 일치하지 않습니다.');
    setLoading(true);
    try { await onSubmit(password); setMessage('비밀번호가 변경되었습니다. 다시 로그인해주세요.'); }
    catch (e) { setError(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.'); }
    finally { setLoading(false); }
  };

  return <div className="w-full max-w-md bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
    <h1 className="text-2xl font-bold text-white text-center mb-2">새 비밀번호 설정</h1>
    <p className="text-slate-400 text-center mb-6">새로운 비밀번호를 입력해주세요.</p>
    {message ? <><p className="text-green-400 text-center mb-6">{message}</p><button onClick={onBack} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white">로그인으로 돌아가기</button></> :
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p role="alert" className="rounded-md border border-red-500/50 bg-red-900/20 p-3 text-center text-sm text-red-400">{error}</p>}
        <input aria-label="새 비밀번호" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="새 비밀번호" required className="w-full rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-3 text-white" />
        <input aria-label="새 비밀번호 확인" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="새 비밀번호 확인" required className="w-full rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-3 text-white" />
        <button disabled={loading} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:bg-slate-600">{loading ? '변경 중...' : '비밀번호 변경'}</button>
      </form>}
  </div>;
};

export default PasswordResetScreen;
