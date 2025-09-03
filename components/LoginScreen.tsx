import React, { useState, useEffect } from 'react';
import { testSupabaseConnection } from '../services/supabaseClient';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  error: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onRegister, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(true); // Start in testing state
  const [testResult, setTestResult] = useState<string | null>(null);


  useEffect(() => {
    setLocalError(error);
  }, [error]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testSupabaseConnection();
    setTestResult(result);
    setIsTesting(false);
  };
  
  // Automatically test connection on component mount
  useEffect(() => {
    handleTestConnection();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    
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
      // On success, the App component will change its state and unmount this
      // component. No need to set isSubmitting back to false here.
    } catch (err) {
      // If onRegister/onLogin fails, App.tsx will reset its state to 'login'
      // and this component will re-render with an error. We should re-enable the form.
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

  return (
    <div className="w-full max-w-md mx-auto bg-slate-800/50 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-2">성경 공부 도우미</h1>
        <p className="text-lg text-slate-300 mb-8">4 단계 방법</p>
        <p className="text-slate-400">
          {isSigningUp ? '계정을 만들어 학습을 시작하세요.' : '학습 세션을 시작하려면 로그인하세요.'}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        {localError && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-sm text-red-300 text-center">{localError}</p>
          </div>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300">
            이메일 주소
          </label>
          <div className="mt-1">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:bg-slate-800"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            비밀번호
          </label>
          <div className="mt-1">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSigningUp ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:bg-slate-800"
              placeholder="********"
            />
          </div>
        </div>
        
        {isSigningUp && (
          <div>
            <label htmlFor="confirm-password" a-label="block text-sm font-medium text-slate-300">
              비밀번호 확인
            </label>
            <div className="mt-1">
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:bg-slate-800"
                placeholder="********"
              />
            </div>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 transition disabled:bg-slate-600 disabled:cursor-wait"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                <span>처리 중...</span>
              </>
            ) : (isSigningUp ? '가입하기' : '로그인')}
          </button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <button onClick={toggleAuthMode} disabled={isSubmitting} className="text-sm text-blue-400 hover:text-blue-300 disabled:text-slate-500">
          {isSigningUp ? '이미 계정이 있으신가요? 로그인하기' : '계정이 없으신가요? 가입하기'}
        </button>
      </div>
      
      <div className="my-6 border-t border-slate-700"></div>

        <div className="space-y-4">
            <div className="h-14"> 
              {isTesting && (
                <div className="p-3 rounded-md text-sm text-center bg-slate-900/50 flex items-center justify-center h-full">
                  <p className="flex items-center justify-center gap-2 text-slate-400">
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                      Supabase 연결 상태를 확인하는 중...
                  </p>
                </div>
              )}
              {testResult && !isTesting && (
                <div className={`p-3 rounded-md text-sm text-center flex items-center justify-center h-full ${testResult.includes('성공') ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
                  <p>{testResult}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-slate-600 rounded-md shadow-sm text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-slate-500 transition disabled:bg-slate-800 disabled:cursor-wait"
            >
              {isTesting ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
              ) : null }
              <span>Supabase 연결 재테스트</span>
            </button>
        </div>

       <p className="text-xs text-slate-500 mt-6 text-center">
          비밀번호는 안전하게 암호화되어 저장됩니다.
       </p>
    </div>
  );
};

export default LoginScreen;