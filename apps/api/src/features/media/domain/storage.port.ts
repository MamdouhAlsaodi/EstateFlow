/**
 * EF-601 — StoragePort: the single boundary every storage adapter implements,
 * mirroring the EF-404 PublishingChannelPort / EF-305 NotificationProviderPort
 * pattern. The API/application layer depends only on this port.
 *
 * Port contract
 * -------------
 * - `issueUploadIntent(binding)`: returns a short-lived signed grant bound to
 *   org/user/property/content-type/max-bytes. In a real S3-compatible adapter
 *   this is a presigned PUT URL/object key pair; the client uploads directly
 *   to the storage service, and the API process NEVER streams file bytes.
 * - `putDirect(key, bytes, contentType)`: the direct-upload entry the storage
 *   service itself exposes. The deterministic in-memory fake implements it as
 *   a Map write; it stands in for the client's direct PUT and is never called
 *   from the confirm/validation path.
 * - `readObject(key)`: bytes for the confirm-time validation (magic-byte
 *   sniffing, sizes, dimensions) and for demo-time display of stored media.
 * - `deleteObjects(keys)`: bulk delete used only by explicit user deletion and
 *   the orphan sweep; adapters must delete exactly the given keys.
 * - `adapterId`: stable adapter identity for tests and diagnostics.
 *
 * Implementations must be deterministic in demo/training mode, must not
 * require credentials, and must never expose server filesystem paths.
 */

import type { UploadIntentBinding, UploadIntentToken } from "./media-intent.js";
import { MediaIntentSigner } from "./media-intent.js";

export type StoredObject = Readonly<{
  key: string;
  bytes: Uint8Array;
  contentType: string;
  byteSize: number;
}>;

export interface StoragePort {
  readonly adapterId: string;
  /** Signs the upload grant; real adapters mint presigned PUT grants here. */
  issueUploadIntent(binding: UploadIntentBinding): UploadIntentToken;
  /** Direct-upload path of the storage service (client-side in production). */
  putDirect(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  readObject(key: string): Promise<Uint8Array | null>;
  deleteObjects(keys: readonly string[]): Promise<number>;
}

/** Deterministic opaque storage token: not a path, not guessable structure. */
export function opaqueStorageKey(mediaId: string, suffix: string): string {
  const raw = mediaId.replace(/-/g, "");
  const base = Buffer.from(raw, "hex").toString("base64url");
  return suffix ? `et1_${base}_${suffix}` : `et1_${base}`;
}

/**
 * The only EF-601 storage implementation activated in this packet: a
 * deterministic in-memory fake. Same inputs always produce the same keys,
 * receipts, and read-back bytes; nothing is persisted and no credentials are
 * involved. Tests inject it; the API module wires it as the StoragePort.
 */
export class InMemoryFakeStorageAdapter implements StoragePort {
  readonly adapterId = "in-memory-fake";
  private readonly objects: Map<string, StoredObject> = new Map();
  private readonly signer: MediaIntentSigner;

  constructor(signer: MediaIntentSigner) {
    this.signer = signer;
  }

  issueUploadIntent(binding: UploadIntentBinding): UploadIntentToken {
    return this.signer.sign(binding);
  }

  async putDirect(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.objects.set(
      key,
      Object.freeze({
        key,
        bytes,
        contentType,
        byteSize: bytes.length,
      }),
    );
  }

  async readObject(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.bytes ?? null;
  }

  async deleteObjects(keys: readonly string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.objects.delete(key)) deleted += 1;
    }
    return deleted;
  }

  /** Test/demo inspection: all stored keys, oldest first. */
  storedKeys(): readonly string[] {
    return [...this.objects.keys()];
  }

  storedObject(key: string): StoredObject | null {
    return this.objects.get(key) ?? null;
  }

  reset(): void {
    this.objects.clear();
  }
}

/**
 * S3-compatible adapter placeholder — same StoragePort, deliberately NOT
 * activated. It is never wired in the API module: no real bucket, no
 * credentials, no network calls exist in this packet. Activating it later
 * means implementing each method against an S3 SDK (presigned PUT grants in
 * `issueUploadIntent`, range-read magic-byte sniffing in `readObject`) behind
 * this exact interface, and requires an approved packet with credentials.
 */
export class S3CompatibleStorageAdapterNotActivated implements StoragePort {
  readonly adapterId = "s3-compatible-not-activated";
  private readonly signer: MediaIntentSigner;

  constructor(signer: MediaIntentSigner) {
    this.signer = signer;
  }

  private refused(): never {
    throw new Error(
      "S3-compatible storage adapter is not activated: no credentials configured (EF-601 port contract)",
    );
  }

  issueUploadIntent(binding: UploadIntentBinding): UploadIntentToken {
    // Signing is credential-free and safe to demonstrate; every byte-path
    // operation refuses so the adapter can never touch real storage.
    return this.signer.sign(binding);
  }

  async putDirect(): Promise<void> {
    this.refused();
  }

  async readObject(): Promise<Uint8Array | null> {
    this.refused();
  }

  async deleteObjects(): Promise<number> {
    this.refused();
  }
}
