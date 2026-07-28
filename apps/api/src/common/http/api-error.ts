import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

type CorrelatedRequest = Request & { requestId?: string };

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<CorrelatedRequest>();
    const known = exception instanceof HttpException;
    const status = known
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = known ? exception.getResponse() : null;
    const message =
      typeof body === "object" && body && "message" in body
        ? (body as { message: unknown }).message
        : known
          ? exception.message
          : "Internal server error";
    response.status(status).json({
      error: {
        code: known ? "HTTP_ERROR" : "INTERNAL_ERROR",
        message,
        requestId: request.requestId ?? "unknown",
      },
    });
  }
}
