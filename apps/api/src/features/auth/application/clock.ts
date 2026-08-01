export interface Clock {
  now(): Date;
}

export const SystemClock: Clock = {
  now: () => new Date(),
};

export class FixedClock implements Clock {
  constructor(private readonly currentTime: Date) {}

  now(): Date {
    return new Date(this.currentTime);
  }

  plusMinutes(minutes: number): Date {
    return new Date(this.currentTime.getTime() + minutes * 60_000);
  }

  plusHours(hours: number): Date {
    return new Date(this.currentTime.getTime() + hours * 3_600_000);
  }
}
