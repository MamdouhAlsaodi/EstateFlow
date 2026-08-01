export type VerificationDeliveryRequest = {
  accountIdentifier: string;
  secret: string;
  expiresAt: Date;
};

export interface VerificationDelivery {
  deliver(request: VerificationDeliveryRequest): Promise<void>;
}

export type PasswordRecoveryDeliveryRequest = {
  accountIdentifier: string;
  secret: string;
  expiresAt: Date;
};

export interface PasswordRecoveryDelivery {
  deliver(request: PasswordRecoveryDeliveryRequest): Promise<void>;
}
