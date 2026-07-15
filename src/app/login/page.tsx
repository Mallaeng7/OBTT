import { Suspense } from 'react';
import LoginError from './LoginError';

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>OBTT</h1>
        <p>
          Rust+ 연동 디스코드 봇 + 웹 대시보드
          <br />
          스팀 계정으로 로그인하세요.
        </p>
        <a className="steam-btn" href="/api/auth/steam">
          🎮 Steam 으로 로그인
        </a>
        <Suspense>
          <LoginError />
        </Suspense>
      </div>
    </div>
  );
}
