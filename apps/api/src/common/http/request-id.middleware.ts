import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CorrelatedRequest = Request & { requestId?: string };
export function requestIdMiddleware(
  request: CorrelatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const inbound = request.header("x-request-id");
  const requestId = inbound && UUID.test(inbound) ? inbound : randomUUID();
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
