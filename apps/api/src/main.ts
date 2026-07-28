import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadRuntimeConfig } from "./bootstrap/config.js";
import { ApiErrorFilter } from "./common/http/api-error.js";
import { requestIdMiddleware } from "./common/http/request-id.middleware.js";
import { requestLoggingMiddleware } from "./common/http/request-logging.middleware.js";
import { buildOpenApiDocument } from "./openapi.js";

export async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error"],
  });
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  buildOpenApiDocument(app);
  await app.listen(config.port);
  new Logger("Bootstrap").log({
    event: "api_started",
    port: config.port,
    environment: config.environment,
  });
}
if (process.argv[1]?.endsWith("main.js")) void bootstrap();
