/**
 * EF-601 — Storage-simulation boundary. In production the client PUTs the
 * bytes directly to the object store with the signed grant; the API process
 * never proxies them through command payloads. This controller stands in for
 * that storage endpoint so the deterministic in-memory fake is reachable from
 * the demo client: it authorizes with the signed intent token (exactly like a
 * presigned PUT), enforces the bound content-type/max-bytes, reads the raw
 * request stream, and writes through the StoragePort only. It is NOT part of
 * the business API and is excluded from the OpenAPI document.
 */

import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ParseUUIDPipe } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { MediaValidationError } from "../domain/media.js";
import { UploadIntentError } from "../domain/media-intent.js";
import type { MediaIntentSigner } from "../domain/media-intent.js";
import type { StoragePort } from "../domain/storage.port.js";
import { StorageObjectQueryDto } from "./media.dto.js";

export const MEDIA_STORAGE_PORT = Symbol("MEDIA_STORAGE_PORT");
export const MEDIA_INTENT_SIGNER = Symbol("MEDIA_INTENT_SIGNER");

/** Hard cap on the simulated direct-upload stream (largest per-kind limit). */
const MAX_STREAM_BYTES = 100 * 1024 * 1024;

@ApiExcludeController()
@ApiTags("Media storage simulation")
@Controller()
export class MediaStorageSimController {
  constructor(
    @Inject(MEDIA_STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(MEDIA_INTENT_SIGNER) private readonly signer: MediaIntentSigner,
  ) {}

  /**
   * Token-authorized direct upload. No CSRF/membership authority here by
   * design: this endpoint represents the storage service, whose only trust
   * anchor is the signed grant. The session guard stays because the fake is
   * reachable only through the same origin.
   */
  @Put(
    "organizations/:organizationId/properties/:propertyId/media/storage-objects/:storageKey",
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(BrowserSessionGuard)
  async putObject(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Param("storageKey") storageKey: string,
    @Query() query: StorageObjectQueryDto,
    @Req() request: AuthenticatedRequest & Request,
  ): Promise<void> {
    try {
      const intent = this.signer.verifySignatureOnly(query.token);
      if (intent.expiresAtEpochSeconds * 1000 < Date.now())
        throw new UploadIntentError("INTENT_EXPIRED");
      if (
        intent.organizationId !== organizationId ||
        intent.propertyId !== propertyId
      )
        throw new UploadIntentError("INTENT_BINDING_MISMATCH");
      if (storageKey.length < 8 || storageKey.length > 120)
        throw new BadRequestException("STORAGE_KEY_INVALID");
      const contentType = String(
        request.headers["content-type"] ?? "",
      ).toLowerCase();
      if (contentType !== intent.contentType)
        throw new UploadIntentError("INTENT_BINDING_MISMATCH");
      const bytes = await readRawBody(request, intent.maxBytes);
      await this.storage.putDirect(storageKey, bytes, contentType);
    } catch (error) {
      if (error instanceof UploadIntentError)
        throw new BadRequestException(error.code);
      if (error instanceof MediaValidationError)
        throw new BadRequestException(error.code);
      throw error;
    }
  }
}

/** Reads the raw body stream with a strict byte cap (storage semantics). */
export function readRawBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      request.removeAllListeners("data");
      request.removeAllListeners("end");
      request.removeAllListeners("error");
      rejectPromise(error);
    };
    request.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes || total > MAX_STREAM_BYTES) {
        fail(new MediaValidationError("OVERSIZE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", (error: Error) => fail(error));
    request.on("end", () => {
      if (settled) return;
      settled = true;
      resolvePromise(new Uint8Array(Buffer.concat(chunks)));
    });
  });
}
