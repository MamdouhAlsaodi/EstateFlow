export type PasswordHashPolicy = {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  saltBytes: number;
  tagBytes: number;
};

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
  needsRehash(passwordHash: string): boolean;
}
