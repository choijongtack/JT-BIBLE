import React, { useState, useEffect } from 'react';
import { IconEye, IconEyeOff, IconLoader, IconBook, IconUsers, IconHeart } from '../constants';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  error: string | null;
  onResetPassword: (email: string) => Promise<void>;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onRegister, onResetPassword, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    setLocalError(error);
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    
    if (!email || !password) {
      setLocalError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    
    if (isSigningUp && password !== confirmPassword) {
      setLocalError("비밀번호가 일치하지 않습니다.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (isSigningUp) {
        await onRegister(email, password);
      } else {
        await onLogin(email, password);
      }
    } catch (err) {
      // Error will be passed via props, but we need to re-enable the form
      setIsSubmitting(false);
    }
  };
  
  const toggleAuthMode = () => {
      setIsSigningUp(!isSigningUp);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLocalError(null);
  };

  const handleReset = async () => {
    setLocalError(null);
    if (!email) return setLocalError('비밀번호 재설정 이메일을 입력해주세요.');
    setIsSubmitting(true);
    try { await onResetPassword(email); setResetSent(true); }
    catch (err) { setLocalError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.'); }
    finally { setIsSubmitting(false); }
  };

  return (
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">성경 공부 도우미</h1>
            <h2 className="text-xl text-slate-300 mb-4">4 단계 방법</h2>
            <p className="text-slate-400">
              {isSigningUp ? '계정을 만들어 학습을 시작하세요.' : '학습 세션을 시작하려면 로그인하세요.'}
            </p>
          </div>

          {/* Error Message */}
          {localError && (
            <div className="mb-6 p-3 rounded-md border border-red-500/50 bg-red-900/20 text-center">
              <p className="text-red-400 text-sm">
                {localError}
              </p>
            </div>
          )}

          {isResetting ? <div className="space-y-5">
            <p className="text-slate-300 text-center">가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.</p>
            {resetSent && <p className="text-green-400 text-center text-sm">재설정 이메일을 확인해주세요.</p>}
            <input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white" required />
            <button onClick={handleReset} disabled={isSubmitting} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl disabled:bg-slate-600">{isSubmitting ? '발송 중...' : '재설정 이메일 보내기'}</button>
            <button type="button" onClick={() => { setIsResetting(false); setResetSent(false); }} className="w-full text-sm text-blue-400">로그인으로 돌아가기</button>
          </div> : <>
          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="text-slate-300 font-medium">
                이메일 주소
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-slate-300 font-medium">
                비밀번호
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition pr-12"
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  disabled={isSubmitting}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보이기"}
                >
                  {showPassword ? (
                    <IconEyeOff className="w-5 h-5" />
                  ) : (
                    <IconEye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {isSigningUp && (
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-slate-300 font-medium">
                  비밀번호 확인
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 입력하세요"
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
                  disabled={isSubmitting}
                  required
                />
              </div>
            )}
            
            {/* Options */}
            {!isSigningUp && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    disabled={isSubmitting}
                    onClick={() => setIsResetting(true)}
                  >
                    비밀번호 찾기
                  </button>
                </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all duration-200 disabled:bg-slate-600 disabled:cursor-wait"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <IconLoader className="w-5 h-5 animate-spin mr-2" />
                  <span>{isSigningUp ? '가입하는 중...' : '로그인 중...'}</span>
                </>
              ) : (
                isSigningUp ? '가입하기' : '로그인'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-800 text-slate-400">또는</span>
            </div>
          </div></>}

          {/* Sign up / Login toggle */}
          <div className="text-center">
            <p className="text-slate-400">
              {isSigningUp ? '이미 계정이 있으신가요? ' : '계정이 없으신가요? '}
              <button onClick={toggleAuthMode} disabled={isSubmitting} className="font-semibold text-blue-400 hover:text-blue-300 transition-colors disabled:text-slate-500">
                {isSigningUp ? '로그인하기' : '가입하기'}
              </button>
            </p>
          </div>

          {/* App Features */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="flex flex-col items-center">
                <IconBook className="w-6 h-6 text-blue-400 mb-2" />
                <span className="text-xs text-slate-400">체계적 학습</span>
              </div>
              <div className="flex flex-col items-center">
                <IconUsers className="w-6 h-6 text-green-400 mb-2" />
                <span className="text-xs text-slate-400">소그룹 활동</span>
              </div>
              <div className="flex flex-col items-center">
                <IconHeart className="w-6 h-6 text-red-400 mb-2" />
                <span className="text-xs text-slate-400">영적 성장</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-slate-500 text-sm">
            하나님의 말씀과 함께하는 여정을 시작하세요
          </p>
        </div>
      </div>
  );
};

export default LoginScreen;
