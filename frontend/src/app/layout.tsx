import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

import { ToastProvider } from '@/components/Toast';

import './globals.css';

import type { Metadata, Viewport } from 'next';

// Pretendard 폰트 (local font)
const pretendard = localFont({
  src: [
    {
      path: '../fonts/Pretendard-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/Pretendard-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/Pretendard-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../fonts/Pretendard-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-pretendard',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
});

// JetBrains Mono 폰트 (코드/시간용)
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '경기도의회 실시간 자막 서비스',
  description: '경기도의회 회의 영상에 실시간/VOD 자막을 제공하는 서비스입니다.',
  keywords: ['경기도의회', '실시간 자막', 'VOD', '회의 자막', '음성 인식'],
  authors: [{ name: '경기도의회' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${jetbrainsMono.variable}`}>
      <body className={pretendard.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
