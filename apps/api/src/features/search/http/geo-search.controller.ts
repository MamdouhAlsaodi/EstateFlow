import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Inject,
  UseGuards,
} from "@nestjs/common";
import {
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import {
  GeoSearchAccessDeniedError,
  GeoSearchApplication,
} from "../application/geo-search-application.js";
import { GeoSearchValidationError } from "../domain/geo-search.js";
import type { GeoSearchCriteria } from "../application/geo-search-repository.js";
import { GeoSearchQueryDto } from "./geo-search.dto.js";

class GeoSearchItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() listingId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() propertyType!: string;
  @ApiProperty() addressText!: string;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
}
class GeoSearchPageDto {
  @ApiProperty({ type: [GeoSearchItemDto] }) items!: GeoSearchItemDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
class GeoClusterDto {
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty() count!: number;
}
class GeoClusterResultDto {
  @ApiProperty({ type: [GeoClusterDto] }) clusters!: GeoClusterDto[];
  @ApiProperty() totalMembers!: number;
}

function parsedJson(value: string | undefined, field: string): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new GeoSearchValidationError(`Invalid ${field}`);
  }
}

function criteriaFromQuery(query: GeoSearchQueryDto): GeoSearchCriteria {
  const polygonValue = parsedJson(query.polygon, "polygon");
  const bboxValue = parsedJson(query.bbox, "bbox");
  return {
    mode: query.mode,
    search: query.search,
    propertyType: query.propertyType,
    ...(query.centerLat !== undefined || query.centerLng !== undefined
      ? { center: { latitude: query.centerLat!, longitude: query.centerLng! } }
      : {}),
    radiusKm: query.radiusKm,
    ...(polygonValue !== undefined
      ? { polygon: polygonValue as GeoSearchCriteria["polygon"] }
      : {}),
    ...(bboxValue !== undefined
      ? { bbox: bboxValue as GeoSearchCriteria["bbox"] }
      : {}),
  };
}

export const GEO_SEARCH_MEMBERSHIP_READER = Symbol(
  "GEO_SEARCH_MEMBERSHIP_READER",
);
type MembershipReader = {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<{
    organizationId: string;
    role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
    status: string;
  } | null>;
};

@ApiExcludeController()
@ApiTags("Geo search")
@Controller()
export class GeoSearchController {
  constructor(
    private readonly search: GeoSearchApplication,
    @Inject(GEO_SEARCH_MEMBERSHIP_READER)
    private readonly memberships: MembershipReader,
  ) {}

  private async actor(request: AuthenticatedRequest, organizationId: string) {
    const membership = await this.memberships.findMembership(
      organizationId,
      request.auth.userId,
    );
    return {
      verified: request.auth.verified,
      memberships: membership
        ? [
            {
              organizationId: membership.organizationId,
              role: membership.role,
              active: membership.status === "ACTIVE",
            },
          ]
        : [],
    };
  }

  @Get("organizations/:organizationId/search/properties")
  @ApiOperation({ operationId: "GeoSearchController_search" })
  @ApiOkResponse({ type: GeoSearchPageDto })
  @UseGuards(BrowserSessionGuard)
  async searchProperties(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: GeoSearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.search.search({
        actor: await this.actor(request, organizationId),
        organizationId,
        criteria: criteriaFromQuery(query),
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Get("organizations/:organizationId/search/properties/clusters")
  @ApiOperation({ operationId: "GeoSearchController_clusters" })
  @ApiOkResponse({ type: GeoClusterResultDto })
  @UseGuards(BrowserSessionGuard)
  async clusters(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: GeoSearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.search.cluster({
        actor: await this.actor(request, organizationId),
        organizationId,
        criteria: criteriaFromQuery(query),
        cellKm: query.cellKm,
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GeoSearchAccessDeniedError)
        throw new ForbiddenException();
      if (error instanceof GeoSearchValidationError)
        throw new BadRequestException();
      throw error;
    }
  }
}
