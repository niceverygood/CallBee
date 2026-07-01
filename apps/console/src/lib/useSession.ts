/**
 * localStorage 기반 로그인 세션을 구독하는 React 훅.
 * fixture 모드에서는 항상 BoBi fixture 테넌트로 "로그인된 것처럼" 동작한다
 * (client.ts 의 FIXTURE_SESSION_TENANT_ID 참조).
 */
import { useEffect, useState } from "react";
import { getSession, subscribeSession } from "./session";
import type { ConsoleSession } from "./session";

export function useSession(): ConsoleSession | null {
  const [session, setSession] = useState<ConsoleSession | null>(() => getSession());

  useEffect(() => subscribeSession(() => setSession(getSession())), []);

  return session;
}
