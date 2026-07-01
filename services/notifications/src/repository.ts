/**
 * NotificationRepository — Notification 레코드 저장 포트 + 인메모리 목.
 * 실제는 @colli/db Prisma 클라이언트로 스왑된다(model Notification).
 * 필드/상태는 contracts(KakaoDeliveryStatus)와 Prisma model 을 따른다.
 */
import type {
  KakaoDeliveryStatus,
  KakaoTemplateKey,
  KakaoTemplateVars,
  NotificationId,
} from "@colli/contracts";

/** 저장되는 Notification 레코드(= Prisma model Notification 서브셋). */
export interface NotificationRecord {
  id: NotificationId;
  templateKey: KakaoTemplateKey;
  toNumber: string;
  vars: KakaoTemplateVars;
  status: KakaoDeliveryStatus;
  /** 대행사 메시지 id (발송 성공 후). */
  providerMsgId: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** create 시 입력(= 아직 발송 전 큐 적재). */
export interface CreateNotificationInput {
  templateKey: KakaoTemplateKey;
  toNumber: string;
  vars: KakaoTemplateVars;
  /** 초기 상태(기본 queued). */
  status?: KakaoDeliveryStatus;
}

/** 발송 시도 결과를 반영하는 부분 업데이트. */
export interface UpdateNotificationInput {
  status?: KakaoDeliveryStatus;
  providerMsgId?: string | null;
  attempts?: number;
  lastError?: string | null;
  sentAt?: Date | null;
}

/**
 * 저장 포트. Worker C 의 send_kakao_alimtalk 는 NotificationsService 경유로만
 * 이 포트를 건드린다(직접 접근 금지).
 */
export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  update(
    id: NotificationId,
    patch: UpdateNotificationInput,
  ): Promise<NotificationRecord>;
  findById(id: NotificationId): Promise<NotificationRecord | null>;
}

/** 테스트/데모용 인메모리 구현. */
export class InMemoryNotificationRepository
  implements NotificationRepository
{
  private readonly store = new Map<string, NotificationRecord>();
  private seq = 0;

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const now = new Date();
    const id = `ntf_${++this.seq}` as NotificationId;
    const record: NotificationRecord = {
      id,
      templateKey: input.templateKey,
      toNumber: input.toNumber,
      vars: input.vars,
      status: input.status ?? "queued",
      providerMsgId: null,
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, record);
    return { ...record };
  }

  async update(
    id: NotificationId,
    patch: UpdateNotificationInput,
  ): Promise<NotificationRecord> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`Notification not found: ${id}`);
    }
    const next: NotificationRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.store.set(id, next);
    return { ...next };
  }

  async findById(id: NotificationId): Promise<NotificationRecord | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  /** 테스트 편의: 전체 레코드 스냅샷. */
  all(): NotificationRecord[] {
    return [...this.store.values()].map((r) => ({ ...r }));
  }
}
