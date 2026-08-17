import { Injectable, Inject } from "@nestjs/common";
import type { Request } from "express";
import type { AuthRequestAbuseContext } from "../application/auth-abuse-control.js";
import { AUTH_KEY_HASHER } from "../auth.tokens.js";
import type { AuthKeyHasher } from "../domain/auth-key-hasher.js";

const MISSING_DIRECT_CLIENT_SOURCE = "missing-direct-client-source";
const MAXIMUM_DIRECT_CLIENT_SOURCE_LENGTH = 256;

@Injectable()
export class AuthRequestContextFactory {
  constructor(
    @Inject(AUTH_KEY_HASHER) private readonly keyHasher: AuthKeyHasher,
  ) {}

  create(
    request: Pick<Request, "socket" | "requestId">,
  ): AuthRequestAbuseContext {
    return {
      clientSourceKeyHash: this.keyHasher.hashClientSource(
        directClientSource(request.socket.remoteAddress),
      ),
      requestCorrelationId: requestCorrelationId(request.requestId),
    };
  }
}

function requestCorrelationId(requestId: string | undefined): string {
  if (
    typeof requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      requestId,
    )
  ) {
    throw new Error("Auth request context requires a canonical request ID");
  }
  return requestId;
}

function directClientSource(remoteAddress: string | undefined): string {
  const normalizedSource = remoteAddress?.trim();
  if (
    !normalizedSource ||
    normalizedSource.length > MAXIMUM_DIRECT_CLIENT_SOURCE_LENGTH
  ) {
    return MISSING_DIRECT_CLIENT_SOURCE;
  }
  return normalizedSource;
}
