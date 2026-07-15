# OBTT

Rust+ 연동 디스코드 봇 + 웹 대시보드 — **단일 Next.js 앱** (프론트 + 백엔드 API + 봇, 프로세스 1개)

## 요구 사항

- Node.js 20 LTS 이상
- 디스코드 봇 토큰 (Developer Portal에서 **Message Content Intent** 활성화 필요)
- Steam Web API 키 — https://steamcommunity.com/dev/apikey

## 시작하기

```bash
npm install
copy .env.example .env   # 값 채우기
npm run register-commands  # 슬래시 명령어 등록 (최초 1회)
npm run build
npm start                  # 웹 + API + 봇 전부 기동
```

개발 모드: `npm run dev`

## 사용 흐름

1. 디스코드에서 `/setup` — 알림/팀챗/기기 채널 자동 생성
2. `/credentials set` — [크리덴셜 앱](https://github.com/liamcottle/rustplus.js#pairing)으로 얻은 FCM 크리덴셜 JSON 등록
3. 인게임 Rust+ 메뉴에서 서버/스마트 기기 **페어링** → 자동 등록 (여러 서버 동시 지원)
4. 웹 대시보드: `WEB_BASE_URL` 접속 → Steam 로그인 → 서버 모니터링/스위치 제어
5. 디스코드 `/link` 로 발급받은 코드를 대시보드에 입력하면 계정 연동

## 인게임(팀챗) 명령어

`!pop` `!time` `!events` `!team` `!on <이름>` `!off <이름>` `!status <이름>` `!upkeep` `!wipe` `!help`

## VPS 배포 (Docker 미사용)

```bash
git clone <repo> && cd OBTT
npm install && npm run build
# systemd 또는 pm2 로 `npm start` 상시 실행
pm2 start npm --name obtt -- start
```

앞단에 Caddy/Nginx 리버스 프록시(HTTPS)를 두고 `PORT`(기본 3000)는 localhost로만 노출하세요.
Steam OAuth 콜백(`STEAM_RETURN_URL`)은 도메인 + HTTPS 기준으로 설정해야 합니다.

## 데이터

- SQLite 단일 파일: `data/obtt.db` (WAL 모드, 최초 기동 시 자동 생성)
- 백업: `data/obtt.db` 파일 하나만 복사하면 끝
