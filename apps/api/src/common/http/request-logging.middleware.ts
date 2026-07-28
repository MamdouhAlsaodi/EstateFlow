import type { NextFunction, Request, Response } from "express";

type CorrelatedRequest = Request & { requestId?: string };

export function requestLoggingMiddleware(
  request: CorrelatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  response.on("finish", () => {
    console.log(
      JSON.stringify({
        event: "request_completed",
        requestId: request.requestId ?? "unknown",
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
  });
  next();
}
