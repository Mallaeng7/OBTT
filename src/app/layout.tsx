import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OBTT — Rust+ 대시보드',
  description: 'Rust+ 연동 디스코드 봇 + 웹 대시보드'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
