/**
 * Authorization: Bearer <token> 검증 NestJS Guard.
 *
 * - 토큰이 없거나 verifyToken() 이 null 을 반환하면 401.
 * - 통과하면 request.account 에 { accountId, role, tenantId } 를 부착한다
 *   (컨트롤러/이후 로직이 req.account 로 조회).
 * - @RequireRole("platform_admin") 데코레이터가 붙은 라우트는 role 이 다르면
 *   403(AuthGuard 가 Reflector 로 메타데이터를 읽어 판정).
 *
 * 주의: GET /tenants/resolve(apps/voice 가 호출하는 070 라우팅 조회)는 이
 * Guard 를 절대 적용하지 않는다 — 통화 세션엔 로그인 토�큰이 없다.
 */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AdminRole } from "@colli/contracts";
import { verifyToken, type TokenPayload } from "./token.js";

export const REQUIRE_ROLE_KEY = "requireRole";

/** 이 라우트를 특정 role 전용으로 제한한다(AuthGuard 와 함께 사용). */
export const RequireRole = (role: AdminRole) => SetMetadata(REQUIRE_ROLE_KEY, role);

export interface AuthenticatedAccount {
  accountId: TokenPayload["accountId"];
  role: TokenPayload["role"];
  tenantId: TokenPayload["tenantId"];
}

export interface RequestWithAccount extends Request {
  account?: AuthenticatedAccount;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

@Injectable()
export class AuthGuard implements CanActivate {
  // 명시적 @Inject(Reflector): esbuild(tsx) 는 emitDecoratorMetadata 를
  // 지원하지 않아 design:paramtypes 가 비어 NestJS 가 타입만으로 이 값을
  // 해석하지 못한다(tenants.controller.ts 의 TenantResolverService 주입과
  // 동일한 문제/해결책 — 라이브 서버를 tsx 로 직접 실행할 때 재현됨).
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAccount>();
    const token = extractBearerToken(req.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException({
        ok: false,
        error: { code: "unauthorized", message: "Authorization: Bearer <token> header required" },
      });
    }

    const payload = verifyToken(token);
    if (!payload) {
      throw new UnauthorizedException({
        ok: false,
        error: { code: "unauthorized", message: "invalid or expired token" },
      });
    }

    req.account = {
      accountId: payload.accountId,
      role: payload.role,
      tenantId: payload.tenantId,
    };

    const requiredRole = this.reflector.getAllAndOverride<AdminRole | undefined>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRole && payload.role !== requiredRole) {
      throw new ForbiddenException({
        ok: false,
        error: {
          code: "forbidden_role",
          message: `this route requires role=${requiredRole}`,
        },
      });
    }

    return true;
  }
}
