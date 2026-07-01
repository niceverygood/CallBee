/**
 * AdminAccount 저장소 포트(어댑터 경계) + 인메모리/Prisma 구현.
 * ToolsModule/TenantModule 의 기존 in-memory/prisma 어댑터 패턴을 그대로 따른다
 * (tenant.ports.ts + adapters/tenant-in-memory.ts + adapters/tenant-prisma.ts 참조).
 *
 * 공유 타입은 오직 @colli/contracts 에서 import. passwordHash 는 계약
 * (AdminAccountSummary)에 노출되지 않는 내부 전용 필드라 별도의 AdminAccountRecord
 * 로 반환한다(로그인 검증에 필요).
 */
import type { AdminAccountId, AdminRole, TenantId } from "@colli/contracts";
import { prisma } from "@colli/db";

/** 저장소 내부 전용 레코드. passwordHash 포함(로그인 검증용) — 컨트롤러 응답에 직접 노출 금지. */
export interface AdminAccountRecord {
  accountId: AdminAccountId;
  email: string;
  passwordHash: string;
  role: AdminRole;
  tenantId: TenantId | null;
  createdAt: string;
}

export interface CreateAdminAccountInput {
  email: string;
  passwordHash: string;
  role: AdminRole;
  tenantId: TenantId | null;
}

export interface AdminAccountRepository {
  findByEmail(email: string): Promise<AdminAccountRecord | null>;
  findById(accountId: AdminAccountId): Promise<AdminAccountRecord | null>;
  create(input: CreateAdminAccountInput): Promise<AdminAccountRecord>;
  listAll(): Promise<AdminAccountRecord[]>;
}

// ── 인메모리 구현(테스트/데모용) ────────────────────────────────
let inMemoryIdSeq = 0;
function nextInMemoryId(): string {
  return `admin_${++inMemoryIdSeq}`;
}

export class InMemoryAdminAccountRepository implements AdminAccountRepository {
  private byId = new Map<string, AdminAccountRecord>();

  async findByEmail(email: string): Promise<AdminAccountRecord | null> {
    const found = [...this.byId.values()].find((a) => a.email === email);
    return found ? { ...found } : null;
  }

  async findById(accountId: AdminAccountId): Promise<AdminAccountRecord | null> {
    const found = this.byId.get(accountId);
    return found ? { ...found } : null;
  }

  async create(input: CreateAdminAccountInput): Promise<AdminAccountRecord> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new Error(`admin account email already exists: ${input.email}`);
    }
    const record: AdminAccountRecord = {
      accountId: nextInMemoryId() as AdminAccountId,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      tenantId: input.tenantId,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(record.accountId, record);
    return { ...record };
  }

  async listAll(): Promise<AdminAccountRecord[]> {
    return [...this.byId.values()].map((a) => ({ ...a }));
  }
}

// ── Prisma 구현(라이브 Postgres) ────────────────────────────────
type Db = typeof prisma;

function toRecord(rec: {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  tenantId: string | null;
  createdAt: Date;
}): AdminAccountRecord {
  return {
    accountId: rec.id as AdminAccountId,
    email: rec.email,
    passwordHash: rec.passwordHash,
    role: rec.role as AdminRole,
    tenantId: rec.tenantId as TenantId | null,
    createdAt: rec.createdAt.toISOString(),
  };
}

export class PrismaAdminAccountRepository implements AdminAccountRepository {
  constructor(private readonly db: Db = prisma) {}

  async findByEmail(email: string): Promise<AdminAccountRecord | null> {
    const rec = await this.db.adminAccount.findUnique({ where: { email } });
    return rec ? toRecord(rec) : null;
  }

  async findById(accountId: AdminAccountId): Promise<AdminAccountRecord | null> {
    const rec = await this.db.adminAccount.findUnique({ where: { id: accountId } });
    return rec ? toRecord(rec) : null;
  }

  async create(input: CreateAdminAccountInput): Promise<AdminAccountRecord> {
    const rec = await this.db.adminAccount.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        tenantId: input.tenantId,
      },
    });
    return toRecord(rec);
  }

  async listAll(): Promise<AdminAccountRecord[]> {
    const rows = await this.db.adminAccount.findMany();
    return rows.map(toRecord);
  }
}
