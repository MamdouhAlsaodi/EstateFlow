import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { RuntimeConfig } from "../../../bootstrap/config.js";
import type { Request } from "express";
import { AUTH_RUNTIME_CONFIG } from "../auth.tokens.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class RequireCanonicalOriginGuard implements CanActivate {
  private readonly canonicalOrigin: string;

  constructor(@Inject(AUTH_RUNTIME_CONFIG) config: RuntimeConfig | string) {
    this.canonicalOrigin =
      typeof config === "string" ? config : config.browserOrigin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (typeof origin !== "string" || origin.includes(",") || origin !== this.canonicalOrigin) {
      throw new ForbiddenException();
    }
    return true;
  }
}
