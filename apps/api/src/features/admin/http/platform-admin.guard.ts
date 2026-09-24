import { Injectable, ForbiddenException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { PlatformRole } from "../../organizations/domain/organization-access.js";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";

/**
 * EF-620 — platform-admin boundary. Distinct from any organization
 * Owner/Manager authority: only a verified session whose principal carries
 * the existing EF-121 PLATFORM_ADMIN platform role may reach the admin
 * surface. Everyone else — including org owners — is denied with 403.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth?.verified || auth.platformRole !== PlatformRole.PLATFORM_ADMIN) {
      throw new ForbiddenException();
    }
    return true;
  }
}
