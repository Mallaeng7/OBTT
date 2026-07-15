'use client';

import { useSearchParams } from 'next/navigation';

export default function LoginError() {
  const params = useSearchParams();
  if (params.get('error') !== 'steam') return null;
  return <div className="login-error">스팀 인증에 실패했습니다. 다시 시도해주세요.</div>;
}
