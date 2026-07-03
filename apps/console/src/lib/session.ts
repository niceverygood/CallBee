/**
 * 콘솔 로그인 세션 저장소.
 *
 * apps/api 의 POST /auth/login 응답(account, token)을 localStorage 에 보관하고,
 * 이후 모든 API 호출(client.ts 의 http())과 라우팅(App.tsx, AppShell.tsx)이
 * 여기서 현재 테넌트 ID/토큰을 읽는다. DEFAULT_TENANT_ID 하드코딩을 대체하는
 * 실제 메커니즘이 바로 이 모듈이다.
 *
 * tenant_admin(사업장)과 platform_admin(총괄관리자) 모두 여기 저장된다 —
 * 도착지 분기는 LoginPage(역할별 리다이렉트)와 RequirePlatformAdmin 가드가
 * 담당한다. platform_admin 세션은 tenantId 가 null 이다.
 */
import type { AdminAccountSummary } from "@colli/contracts";

const STORAGE_KEY = "colli-console-session";

export interface ConsoleSession {
  token: string;
  account: AdminAccountSummary;
}

function readRaw(): ConsoleSession | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ConsoleSession;
    if (!parsed?.token || !parsed?.account) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSession(): ConsoleSession | null {
  return readRaw();
}

export function saveSession(session: ConsoleSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getToken(): string | null {
  return readRaw()?.token ?? null;
}

/** 로그인 후 저장된 tenant_admin 계정의 tenantId. 없으면 null(로그인 안 됨). */
export function getSessionTenantId(): string | null {
  const session = readRaw();
  if (!session) return null;
  return session.account.tenantId ? String(session.account.tenantId) : null;
}

/**
 * 세션 변경(로그인/로그아웃) 을 구독하는 리스너들. React 컴포넌트가
 * localStorage 변경 후 리렌더할 수 있도록 간단한 pub/sub 를 둔다
 * (여러 탭 동기화는 범위 밖 — storage 이벤트는 다루지 않는다).
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) l();
}

export function loginSession(session: ConsoleSession): void {
  saveSession(session);
  notify();
}

export function logoutSession(): void {
  clearSession();
  notify();
}
