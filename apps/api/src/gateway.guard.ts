/**
 * 음성 게이트웨이 전용 고정 시크릿 인증 Guard (/ingest/* 라우트).
 *
 * 통화 세션엔 로그인 토큰이 없으므로(AuthGuard 부적합), 게이트웨이 프로세스와
 * apps/api 가 공유하는 고정 시크릿 헤더 `x-gateway-secret` 로 보호한다.
 * process.env.GATEWAY_SHARED_SECRET (미설정 시 개발용 fallback
 * "dev-gateway-secret") 과 일치해야 통과, 불일치/누락은 401.
 *
 * 비교는 @colli/compliance 의 safeEqual(timingSafeEqual 기반)로 타이밍 공격을
 * 차단한다. 시크릿 값 자체는 로그/에러 메시지에 절대 노출하지 않는다.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { safeEqual } from "@colli/compliance";

export const GATEWAY_SECRET_HEADER = "x-gateway-secret";

/** 개발용 fallback — 운영은 반드시 GATEWAY_SHARED_SECRET 환경변수를 설정할 것. */
export const DEV_GATEWAY_SECRET_FALLBACK = "dev-gateway-secret";

export function expectedGatewaySecret(): string {
  return process.env.GATEWAY_SHARED_SECRET ?? DEV_GATEWAY_SECRET_FALLBACK;
}

@Injectable()
export class GatewayGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers?.[GATEWAY_SECRET_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (typeof provided !== "string" || !safeEqual(provided, expectedGatewaySecret())) {
      throw new UnauthorizedException({
        ok: false,
        error: {
          code: "unauthorized",
          message: `valid ${GATEWAY_SECRET_HEADER} header required`,
        },
      });
    }
    return true;
  }
}
