import type {
  PasswordRecoveryDelivery,
  PasswordRecoveryDeliveryRequest,
  VerificationDelivery,
  VerificationDeliveryRequest,
} from "../application/verification-delivery.js";

type AuthDeliveryEntry =
  | VerificationDeliveryRequest
  | PasswordRecoveryDeliveryRequest;

const MAXIMUM_DELIVERIES = 100;

export class InMemoryAuthDelivery
  implements VerificationDelivery, PasswordRecoveryDelivery
{
  private readonly deliveries: AuthDeliveryEntry[] = [];

  async deliver(request: AuthDeliveryEntry): Promise<void> {
    if (this.deliveries.length === MAXIMUM_DELIVERIES) {
      this.deliveries.shift();
    }
    this.deliveries.push({ ...request, expiresAt: new Date(request.expiresAt) });
  }
}
