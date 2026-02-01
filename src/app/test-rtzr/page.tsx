'use client';

import { useState, useRef, useCallback } from 'react';
import { useRtzrStream } from '@/hooks/useRtzrStream';
import { AudioCapture } from '@/lib/audio/capture';

interface TranscriptEntry {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

export default function TestRtzrPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('대기 중');
  const audioCaptureRef = useRef<AudioCapture | null>(null);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal && text.trim()) {
      setTranscripts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: text.trim(),
          isFinal: true,
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setStatus('오류 발생');
  }, []);

  const {
    isConnected,
    isConnecting,
    currentTranscript,
    connect,
    disconnect,
    sendAudio,
    sendEOS,
  } = useRtzrStream({
    onTranscript: handleTranscript,
    onError: handleError,
  });

  const startRecording = async () => {
    try {
      setError(null);
      setStatus('RTZR 토큰 요청 중...');

      // RTZR 토큰 요청
      const tokenResponse = await fetch('/api/auth/rtzr', { method: 'POST' });
      if (!tokenResponse.ok) {
        throw new Error('RTZR 인증 실패');
      }
      const { token } = await tokenResponse.json();

      setStatus('WebSocket 연결 중...');
      connect(token);

      // 마이크 캡처 시작
      setStatus('마이크 권한 요청 중...');
      const audioCapture = new AudioCapture({
        sampleRate: 16000,
        onAudioData: (pcmData) => {
          sendAudio(pcmData);
        },
      });

      await audioCapture.startFromMicrophone();
      audioCaptureRef.current = audioCapture;

      setIsRecording(true);
      setStatus('녹음 중...');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
      setStatus('오류 발생');
    }
  };

  const stopRecording = () => {
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }

    sendEOS();
    disconnect();

    setIsRecording(false);
    setStatus('녹음 종료');
  };

  const clearTranscripts = () => {
    setTranscripts([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">RTZR STT 테스트</h1>

        {/* 상태 표시 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">상태</p>
              <p className="font-medium">{status}</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected
                    ? 'bg-green-500'
                    : isConnecting
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-gray-300'
                }`}
              />
              <span className="text-sm">
                {isConnected ? '연결됨' : isConnecting ? '연결 중' : '미연결'}
              </span>
            </div>
          </div>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* 컨트롤 버튼 */}
        <div className="flex gap-4 mb-6">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isConnecting}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10 2a3 3 0 013 3v5a3 3 0 11-6 0V5a3 3 0 013-3z" />
                <path
                  fillRule="evenodd"
                  d="M5 10a5 5 0 0010 0V5a5 5 0 00-10 0v5zm8 0V5a3 3 0 10-6 0v5a3 3 0 106 0z"
                  clipRule="evenodd"
                />
              </svg>
              녹음 시작
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <rect x="5" y="5" width="10" height="10" rx="1" />
              </svg>
              녹음 중지
            </button>
          )}

          <button
            onClick={clearTranscripts}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            지우기
          </button>
        </div>

        {/* 현재 인식 중인 텍스트 (interim) */}
        {currentTranscript && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-600 mb-1">인식 중...</p>
            <p className="text-lg">{currentTranscript}</p>
          </div>
        )}

        {/* 확정된 자막 목록 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">인식된 자막</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {transcripts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                녹음을 시작하면 인식된 자막이 여기에 표시됩니다.
              </div>
            ) : (
              transcripts.map((entry) => (
                <div key={entry.id} className="p-4">
                  <p className="text-sm text-gray-500 mb-1">
                    {entry.timestamp.toLocaleTimeString()}
                  </p>
                  <p>{entry.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 테스트 안내 */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">테스트 방법</h3>
          <ol className="list-decimal list-inside text-blue-700 space-y-1 text-sm">
            <li>&apos;녹음 시작&apos; 버튼을 클릭합니다.</li>
            <li>마이크 권한을 허용합니다.</li>
            <li>한국어로 말하면 실시간으로 자막이 생성됩니다.</li>
            <li>&apos;녹음 중지&apos; 버튼을 클릭하여 종료합니다.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
