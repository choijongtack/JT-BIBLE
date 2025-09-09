import React from 'react';
import type { UserProgress } from '../types';

interface ProgressDebugPanelProps {
  debugInfo: {
    before: UserProgress | null;
    request: UserProgress | null;
    after: UserProgress | null;
    error: string | null;
  } | null;
}

const ProgressDebugPanel: React.FC<ProgressDebugPanelProps> = ({ debugInfo }) => {
  if (!debugInfo) {
    return null;
  }

  const { before, request, after, error } = debugInfo;

  const getStatusMessage = () => {
    if (error) {
      return "RLS 정책 또는 JWT 토큰 문제일 수 있습니다. Supabase Logs 확인 필요.";
    }
    if (before && after && JSON.stringify(before) === JSON.stringify(after)) {
      return "업데이트가 반영되지 않았습니다. book/newTopic이 중복되었는지 확인하세요.";
    }
    if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
      return "✅ 업데이트 성공: DB에 progress가 반영되었습니다.";
    }
    return null; // No specific status to show
  };

  const statusMessage = getStatusMessage();

  return (
    <div className="mt-8 p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-left text-xs">
      <h4 className="text-base font-bold text-slate-200 mb-3 text-center">Progress Update Debug</h4>
      
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-slate-400">📌 Before:</p>
          <pre className="text-slate-300 bg-slate-800 p-2 rounded-md font-mono whitespace-pre-wrap max-h-40 overflow-auto">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
        
        {request && (
          <div>
            <p className="font-semibold text-slate-400">📌 Request:</p>
            <pre className="text-slate-300 bg-slate-800 p-2 rounded-md font-mono whitespace-pre-wrap max-h-40 overflow-auto">
              {JSON.stringify(request, null, 2)}
            </pre>
          </div>
        )}

        {after && (
          <div>
            <p className="font-semibold text-slate-400">📌 After:</p>
            <pre className="text-slate-300 bg-slate-800 p-2 rounded-md font-mono whitespace-pre-wrap max-h-40 overflow-auto">
              {JSON.stringify(after, null, 2)}
            </pre>
          </div>
        )}
        
        {statusMessage && (
          <div className="mt-4 p-3 rounded-md bg-slate-700/50 border border-slate-600 text-center">
            <p className="font-semibold text-slate-300 text-sm">{statusMessage}</p>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <p className="font-semibold text-red-400">Error Details:</p>
            <pre className="text-red-300 bg-red-900/50 p-2 rounded-md font-mono whitespace-pre-wrap max-h-40 overflow-auto">
              {error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressDebugPanel;
