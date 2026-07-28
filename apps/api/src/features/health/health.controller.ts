import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from "@nestjs/swagger";

const healthStatusSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["ok"] },
  },
};

@Controller("health")
export class HealthController {
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
  @ApiServiceUnavailableResponse({ description: "Dependencies are not ready" })
  ready() {
    if (process.env.ESTATEFLOW_READY === "false")
      throw new ServiceUnavailableException("Dependencies are not ready");

    return { status: "ok" };
  }
}
