export interface AuthKeyHasher {
  hashAccount(accountIdentifier: string): string;
  hashClientSource(clientSource: string): string;
}
