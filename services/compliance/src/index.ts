/**
 * @colli/compliance — Worker F (규제·보안, 횡단).
 *
 * A/C 트랙이 끼워 쓰는 가드·게이트·유틸·로거의 단일 진입점.
 * 공유 도메인 타입은 오직 `@colli/contracts` 에서만 가져온다.
 *
 * 주요 export:
 * - maskPII / containsPaymentPII                결제정보(카드/계좌/CVC) 탐지·마스킹
 * - encryptPII / decryptPII / withDecryptedPII  PII AES-256-GCM 암호화(node:crypto)
 * - paymentGuard / assertNoPaymentCollection    billing → 셀프서비스 강제
 * - requireVerifiedSubscriber / verificationStateFromLookup  본인확인 게이트
 * - ConsentLogger / ConsentRepository / InMemoryConsentRepository  고지·동의 로깅
 * - getDisclosure / allDisclosures / DISCLOSURE_TEXTS  고지 멘트·버전
 * - checkCallDisclosures / findNonCompliantCalls  AI기본법 고지·동의 checker
 * - AuditLogger / InMemoryAuditLogger            감사 로그
 */

// PII 마스킹(결제정보 차단)
export {
  maskPII,
  containsPaymentPII,
  PII_MASK,
  type PiiKind,
  type PiiMatch,
  type MaskPiiResult,
} from "./pii-mask.js";

// PII 암호화
export {
  encryptPII,
  decryptPII,
  withDecryptedPII,
  resolveKey,
  safeEqual,
} from "./pii-crypto.js";

// 고지·동의
export {
  ConsentLogger,
  InMemoryConsentRepository,
  getDisclosure,
  allDisclosures,
  DISCLOSURE_TEXTS,
  DISCLOSURE_VERSION,
  type ConsentKind,
  type ConsentRepository,
  type ConsentRecordInput,
  type ConsentRecordEntity,
  type DisclosureScript,
} from "./consent.js";

// 본인확인 게이트
export {
  requireVerifiedSubscriber,
  requireSubscriberId,
  isVerified,
  verificationStateFromLookup,
  VerificationRequiredError,
  SUBSCRIBER_GATED_TOOLS,
  type VerificationState,
} from "./verification-gate.js";

// 결제 가드
export {
  paymentGuard,
  assertNoPaymentCollection,
  PaymentCollectionBlockedError,
  PAYMENT_INTENTS,
  type PaymentGuardDecision,
} from "./payment-guard.js";

// AI기본법 고지 checker
export {
  checkCallDisclosures,
  findNonCompliantCalls,
  REQUIRED_CONSENT_KINDS,
  type DisclosureCheckResult,
} from "./disclosure-checker.js";

// 감사 로그
export {
  InMemoryAuditLogger,
  sanitizeAuditEvent,
  type AuditLogger,
  type AuditEvent,
  type AuditEventInput,
  type AuditEventType,
  type AuditSeverity,
} from "./audit-log.js";
