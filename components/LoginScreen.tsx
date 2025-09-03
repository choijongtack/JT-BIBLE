import React, { useState, useEffect } from 'react';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => void;
  onRegister: (email: string, password: string) => void;
  error: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onRegister, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLocalError(error);
  }, [error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    
    if (isSigningUp) {
      if (password !== confirmPassword) {
        setLocalError("비밀번호가 일치하지 않습니다.");
        return;
      }
      onRegister(email, password);
    } else {
      onLogin(email, password);
    }
  };
  
  const toggleAuthMode = () => {
      setIsSigningUp(!isSigningUp);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLocalError(null);
  }

  return (
    <div className="w-full max-w-md mx-auto bg-slate-800/50 p-8 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-slate-100 mb-2">성경 공부 도우미</h1>
        <p className="text-lg text-slate-300 mb-8">변호사의 방법</p>
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
              className="w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
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
              className="w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
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
                className="w-full px-3 py-2 bg-slate-700 border border-slate-500 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                placeholder="********"
              />
            </div>
          </div>
        )}

        <div>
          <button
            type="submit"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 transition"
          >
            {isSigningUp ? '가입하기' : '로그인'}
          </button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <button onClick={toggleAuthMode} className="text-sm text-blue-400 hover:text-blue-300">
          {isSigningUp ? '이미 계정이 있으신가요? 로그인하기' : '계정이 없으신가요? 가입하기'}
        </button>
      </div>

       <p className="text-xs text-slate-500 mt-6 text-center">
          참고: 비밀번호는 암호화되지 않고 로컬 저장소에 저장됩니다. 실제 프로덕션 환경에서는 사용하지 마세요.
       </p>
    </div>
  );
};

export default LoginScreen;