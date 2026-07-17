'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { io, type Socket } from 'socket.io-client';

interface Me {
  steamId: string;
  personaName: string;
  avatar: string;
  role: 'admin' | 'manager' | 'viewer';
  linkedDiscordId: string | null;
}

interface ServerSummary {
  id: number;
  title: string;
  ip: string;
  port: number;
  isActive: boolean;
  status: 'connecting' | 'online' | 'offline';
}

interface TeamMember {
  steamId: string;
  name: string;
  isOnline: boolean;
  isAlive: boolean;
  grid: string;
}

interface LiveState {
  serverId: number;
  status: 'connecting' | 'online' | 'offline';
  info?: {
    name: string;
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    mapSize: number;
    wipeTime: number;
  };
  time?: { time: number; sunrise: number; sunset: number };
  team?: TeamMember[];
}

interface Device {
  id: number;
  entityId: string;
  type: 'switch' | 'alarm' | 'storage_monitor';
  name: string;
  group: string | null;
  state: boolean;
}

interface EventEntry {
  type: string;
  message?: string;
  at: string;
}

const EVENT_LABEL: Record<string, string> = {
  cargo_spawn: '카고쉽 출현',
  cargo_leave: '카고쉽 퇴장',
  heli_spawn: '순찰 헬기 출현',
  heli_leave: '순찰 헬기 퇴장',
  ch47: 'CH47 출현',
  crate_drop: '잠긴 상자 드롭',
  crate_gone: '잠긴 상자 소멸',
  explosion: '폭발 감지'
};

function gameClock(time?: { time: number }): string {
  if (!time) return '-';
  const h = Math.floor(time.time);
  const m = Math.floor((time.time - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function wipeDays(wipeTime?: number): string {
  if (!wipeTime) return '-';
  return `${Math.floor((Date.now() / 1000 - wipeTime) / 86400)}일`;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [live, setLive] = useState<Record<number, LiveState>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [eventsEnabled, setEventsEnabled] = useState(true);
  const [linkCode, setLinkCode] = useState('');
  const [notice, setNotice] = useState('');
  const [openMenu, setOpenMenu] = useState<{ id: number; top: number; left: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.server-menu-trigger') || target.closest('.server-menu-panel')) return;
      setOpenMenu(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const loadServerDetail = useCallback(async (serverId: number) => {
    const res = await fetch(`/api/servers/${serverId}/state`);
    if (!res.ok) return;
    const data = await res.json();
    setDevices(data.devices ?? []);
    setEvents(
      (data.recentEvents ?? []).map((e: any) => ({ type: e.event_type, at: e.occurred_at }))
    );
    setEventsEnabled(data.server?.eventsEnabled ?? true);
    setLive((prev) => ({ ...prev, [serverId]: data.state }));
  }, []);

  // 초기 로드
  useEffect(() => {
    void (async () => {
      const [meRes, serversRes] = await Promise.all([fetch('/api/me'), fetch('/api/servers')]);
      if (meRes.status === 401) {
        window.location.href = '/login';
        return;
      }
      setMe(await meRes.json());
      const list: ServerSummary[] = await serversRes.json();
      setServers(list);
      if (list.length > 0) {
        setSelected(list[0].id);
        void loadServerDetail(list[0].id);
      }
    })();
  }, [loadServerDetail]);

  // Socket.IO 실시간 구독
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('snapshot', (states: LiveState[]) => {
      setLive((prev) => {
        const next = { ...prev };
        for (const s of states) next[s.serverId] = s;
        return next;
      });
    });

    socket.on('server:update', (state: LiveState) => {
      setLive((prev) => ({ ...prev, [state.serverId]: state }));
      setServers((prev) => prev.map((s) => (s.id === state.serverId ? { ...s, status: state.status } : s)));
    });

    socket.on('server:event', (event: { serverId: number; type: string; message: string; at: string }) => {
      if (event.serverId === selectedRef.current) {
        setEvents((prev) => [{ type: event.type, message: event.message, at: event.at }, ...prev].slice(0, 50));
      }
    });

    socket.on('device:state', (change: { serverId: number; entityId: string; state: boolean }) => {
      if (change.serverId === selectedRef.current) {
        setDevices((prev) => prev.map((d) => (d.entityId === change.entityId ? { ...d, state: change.state } : d)));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const select = (id: number) => {
    setSelected(id);
    setDevices([]);
    setEvents([]);
    void loadServerDetail(id);
  };

  const toggleSwitch = async (device: Device) => {
    if (!selected) return;
    const res = await fetch(`/api/servers/${selected}/switches/${device.entityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle' })
    });
    if (res.status === 403) setNotice('제어 권한이 없습니다 (manager 이상 필요).');
    else if (!res.ok) setNotice('서버가 오프라인이거나 Rust+ 연결이 끊어졌습니다.');
    else setNotice('');
    // 실제 상태 반영은 socket 'device:state' 이벤트로 수신
  };

  const setConnection = async (serverId: number, connected: boolean) => {
    const res = await fetch(`/api/servers/${serverId}/connection`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected })
    });
    if (!res.ok) setNotice('연결 상태를 변경할 권한이 없습니다 (admin 필요).');
    else setNotice('');
    // 실제 상태는 socket 'server:update' 이벤트로 반영됨
  };

  const toggleEventsEnabled = async () => {
    if (!selected) return;
    const next = !eventsEnabled;
    const res = await fetch(`/api/servers/${selected}/events`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next })
    });
    if (!res.ok) {
      setNotice('이벤트 알림 설정을 변경할 권한이 없습니다 (admin 필요).');
      return;
    }
    setEventsEnabled(next);
    setNotice('');
  };

  const submitLink = async () => {
    const res = await fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: linkCode })
    });
    const data = await res.json();
    if (res.ok) {
      setNotice('디스코드 계정이 연동되었습니다.');
      setMe((m) => (m ? { ...m, linkedDiscordId: data.discordUserId } : m));
      setLinkCode('');
    } else {
      setNotice(data.error || '연동에 실패했습니다.');
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const state = selected != null ? live[selected] : undefined;
  const switches = useMemo(() => devices.filter((d) => d.type === 'switch'), [devices]);
  const monitors = useMemo(() => devices.filter((d) => d.type === 'storage_monitor'), [devices]);
  const alarms = useMemo(() => devices.filter((d) => d.type === 'alarm'), [devices]);
  const canControl = me?.role === 'admin' || me?.role === 'manager';

  return (
    <div className="dash">
      <header className="dash-header">
        <span className="dash-logo">OBTT</span>
        <span className="spacer" />
        {notice && <span style={{ color: 'var(--warn)', fontSize: 13 }}>{notice}</span>}
        {me && !me.linkedDiscordId && (
          <div className="link-form" title="디스코드에서 /link 로 발급받은 코드 입력">
            <input
              placeholder="연동 코드"
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value)}
              maxLength={6}
            />
            <button className="btn" onClick={() => void submitLink()}>
              디스코드 연동
            </button>
          </div>
        )}
        {me && (
          <div className="user-chip">
            {me.avatar && <img src={me.avatar} alt="" />}
            <span>{me.personaName}</span>
            <span className="role-badge">{me.role}</span>
          </div>
        )}
        <button className="btn" onClick={() => void logout()}>
          로그아웃
        </button>
      </header>

      <aside className="dash-sidebar">
        <div className="sidebar-title">러스트 서버</div>
        {servers.length === 0 && (
          <div className="sidebar-empty">
            등록된 서버가 없습니다.
            <br />
            디스코드에서 /credentials 등록 후 인게임 Rust+ 메뉴에서 서버를 페어링하세요.
          </div>
        )}
        {servers.map((s) => {
          const status = live[s.id]?.status ?? s.status;
          return (
            <div key={s.id} className="server-item-row">
              <button className={`server-item ${selected === s.id ? 'selected' : ''}`} onClick={() => select(s.id)}>
                <span className={`dot ${status}`} />
                <span className="name">{s.title}</span>
                {s.isActive && <span title="디스코드 명령어 대상">⭐</span>}
              </button>
              {me?.role === 'admin' && (
                <div className="server-menu">
                  <button
                    className="server-menu-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (openMenu?.id === s.id) {
                        setOpenMenu(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      setOpenMenu({ id: s.id, top: rect.bottom + 4, left: rect.right - 120 });
                    }}
                  >
                    ⋮
                  </button>
                  {openMenu?.id === s.id &&
                    createPortal(
                      <div
                        className="server-menu-panel"
                        style={{ position: 'fixed', top: openMenu.top, left: openMenu.left }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {status === 'offline' ? (
                          <button className="server-menu-item" onClick={() => void setConnection(s.id, true)}>
                            연결하기
                          </button>
                        ) : (
                          <button className="server-menu-item danger" onClick={() => void setConnection(s.id, false)}>
                            연결 끊기
                          </button>
                        )}
                      </div>,
                      document.body
                    )}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      <main className="dash-main">
        {!state && <div className="empty">서버를 선택하세요.</div>}

        {state && (
          <>
            <div className="cards">
              <div className="card">
                <div className="label">연결 상태</div>
                <div className="value">
                  {state.status === 'online' ? '🟢 온라인' : state.status === 'connecting' ? '🟡 연결 중' : '🔴 오프라인'}
                </div>
              </div>
              <div className="card">
                <div className="label">인원 / 대기열</div>
                <div className="value">
                  {state.info ? `${state.info.players}/${state.info.maxPlayers}` : '-'}
                  {state.info?.queuedPlayers ? ` (+${state.info.queuedPlayers})` : ''}
                </div>
              </div>
              <div className="card">
                <div className="label">인게임 시간</div>
                <div className="value">{gameClock(state.time)}</div>
              </div>
              <div className="card">
                <div className="label">와이프 경과</div>
                <div className="value">{wipeDays(state.info?.wipeTime)}</div>
              </div>
              <div className="card">
                <div className="label">맵 크기</div>
                <div className="value">{state.info?.mapSize ?? '-'}</div>
              </div>
            </div>

            <section className="section">
              <h2>스마트 스위치</h2>
              {switches.length === 0 && <div className="empty">페어링된 스위치가 없습니다.</div>}
              <div className="device-grid">
                {switches.map((d) => (
                  <div key={d.id} className="device">
                    <div className="info">
                      <div className="name">🔌 {d.name}</div>
                      <div className="meta">{d.group ? `그룹: ${d.group}` : `entity ${d.entityId}`}</div>
                    </div>
                    <button
                      className={`toggle ${d.state ? 'on' : 'off'}`}
                      disabled={!canControl}
                      title={canControl ? '' : 'manager 이상 권한 필요'}
                      onClick={() => void toggleSwitch(d)}
                    >
                      {d.state ? '켜짐' : '꺼짐'}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {(alarms.length > 0 || monitors.length > 0) && (
              <section className="section">
                <h2>알람 / 저장 모니터</h2>
                <div className="device-grid">
                  {alarms.map((d) => (
                    <div key={d.id} className="device">
                      <div className="info">
                        <div className="name">🚨 {d.name}</div>
                        <div className="meta">스마트 알람</div>
                      </div>
                    </div>
                  ))}
                  {monitors.map((d) => (
                    <div key={d.id} className="device">
                      <div className="info">
                        <div className="name">🧰 {d.name}</div>
                        <div className="meta">저장 모니터 (TC)</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="row-2col">
              <section className="section">
                <h2>팀원</h2>
                {(state.team?.length ?? 0) === 0 ? (
                  <div className="empty">팀 정보가 없습니다.</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>상태</th>
                        <th>이름</th>
                        <th>위치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.team!.map((m) => (
                        <tr key={m.steamId}>
                          <td>{m.isOnline ? '🟢 온라인' : '⚫ 오프라인'}</td>
                          <td>{m.name}</td>
                          <td>{m.grid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="section">
                <div className="section-header">
                  <h2>이벤트 타임라인</h2>
                  {me?.role === 'admin' && (
                    <button className={`toggle ${eventsEnabled ? 'on' : 'off'}`} onClick={() => void toggleEventsEnabled()}>
                      알림 {eventsEnabled ? '켜짐' : '꺼짐'}
                    </button>
                  )}
                </div>
                {events.length === 0 ? (
                  <div className="empty">아직 기록된 이벤트가 없습니다.</div>
                ) : (
                  <div className="event-list">
                    {events.map((e, idx) => (
                      <div key={idx} className="event-item">
                        <span>{e.message ?? EVENT_LABEL[e.type] ?? e.type}</span>
                        <span className="time">{timeAgo(e.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
