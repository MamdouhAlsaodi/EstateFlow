import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from "@nestjs/swagger";
import {
  PrismaReadinessProbe,
  ReadinessProbePort,
} from "./readiness-probe.port.js";

const healthStatusSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["ok"] },
  },
};

/** Strict time box for one readiness answer; every caller resolves within it. */
const READINESS_TIMEOUT_MS = 1_000;

const GENERIC_NOT_READY = "Dependencies are not ready";

@Controller("health")
export class HealthController {
  /** At most one outstanding probe; concurrent callers share its verdict. */
  private inFlight?: Promise<boolean>;

  constructor(
    @Inject(PrismaReadinessProbe)
    private readonly readinessProbe: ReadinessProbePort,
  ) {}

  @Get("live")
  @ApiOperation({ operationId: "getLiveHealth" })
  @ApiOkResponse({ description: "Service is live", schema: healthStatusSchema })
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ operationId: "getReadyHealth" })
  @ApiOkResponse({
    description: "Service is ready",
    schema: healthStatusSchema,
  })
  @ApiServiceUnavailableResponse({ description: GENERIC_NOT_READY })
  async ready(): Promise<{ status: "ok" }> {
    if (process.env.ESTATEFLOW_READY === "false")
      throw new ServiceUnavailableException(GENERIC_NOT_READY);

    if (!(await this.readiness()))
      throw new ServiceUnavailableException(GENERIC_NOT_READY);

    return { status: "ok" };
  }

  /**
   * Single-flight admission: probe results are shared while one is outstanding
   * so a hung query can never spawn unbounded concurrent probes. Every caller
   * still gets its own strictly time-boxed answer, and the slot is released as
   * soon as the underlying probe settles so recovery is re-probed. Probe
   * outcome carries no exception detail; any failure or timeout maps to the
   * same generic not-ready verdict.
   */
  private readiness(): Promise<boolean> {
    if (this.inFlight === undefined) {
      let attempt: Promise<void>;
      try {
        attempt = this.readinessProbe.check();
      } catch {
        return Promise.resolve(false);
      }
      const probe = attempt.then(
        () => true,
        () => false,
      );
      const slot = probe.finally(() => {
        if (this.inFlight === slot) this.inFlight = undefined;
      });
      this.inFlight = slot;
    }

    const shared = this.inFlight;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      shared,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
  }
}
