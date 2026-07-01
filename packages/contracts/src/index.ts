/**
 * @colli/contracts — Colli-BoBi 공유 계약의 단일 진입점.
 * 모든 Worker 는 여기서만 타입/스키마/상수를 import 한다.
 */
export * from "./domain.js";
export * from "./tools.js";
export * from "./kakao.js";
export * from "./webhooks.js";

/** 계약 버전 — breaking change 시 증가(Orchestrator 승인 후 전파) */
export const CONTRACTS_VERSION = "0.1.0" as const;
