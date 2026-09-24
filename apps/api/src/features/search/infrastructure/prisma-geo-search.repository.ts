import { Prisma, type PrismaClient } from "@prisma/client";
import {
  encodeCursor,
  type GeoBoundingBox,
  type GeoPoint,
} from "../domain/geo-search.js";
import type {
  GeoClusterResult,
  GeoSearchCriteria,
  GeoSearchItem,
  GeoSearchPage,
  GeoSearchRepository,
} from "../application/geo-search-repository.js";

function polygonWkt(points: readonly GeoPoint[]): string {
  return `POLYGON((${points.map((point) => `${point.longitude} ${point.latitude}`).join(", ")}))`;
}

function spatialClause(criteria: GeoSearchCriteria): Prisma.Sql {
  if (criteria.mode === "radius") {
    return Prisma.sql`ST_DWithin(
      p."location",
      ST_SetSRID(ST_MakePoint(${criteria.center!.longitude}, ${criteria.center!.latitude}), 4326)::geography,
      ${criteria.radiusKm! * 1000}
    )`;
  }
  if (criteria.mode === "polygon") {
    return Prisma.sql`ST_Covers(
      ST_GeomFromText(${polygonWkt(criteria.polygon!)}, 4326),
      p."location"::geometry
    )`;
  }
  const box = criteria.bbox as GeoBoundingBox;
  return Prisma.sql`ST_Intersects(
    p."location"::geometry,
    ST_MakeEnvelope(${box.minLongitude}, ${box.minLatitude}, ${box.maxLongitude}, ${box.maxLatitude}, 4326)
  )`;
}

function baseWhere(
  organizationId: string,
  criteria: GeoSearchCriteria,
  cursor?: string,
): Prisma.Sql {
  const clauses = [
    Prisma.sql`p."organizationId" = ${organizationId}::uuid`,
    Prisma.sql`p."status" = 'ACTIVE'`,
    Prisma.sql`l."status" = 'PUBLISHED'`,
    Prisma.sql`p."location" IS NOT NULL`,
    spatialClause(criteria),
  ];
  if (criteria.search !== undefined) {
    const pattern = `%${criteria.search}%`;
    clauses.push(
      Prisma.sql`(p."title" ILIKE ${pattern} OR p."addressText" ILIKE ${pattern})`,
    );
  }
  if (criteria.propertyType !== undefined)
    clauses.push(Prisma.sql`p."propertyType" = ${criteria.propertyType}`);
  if (cursor !== undefined) clauses.push(Prisma.sql`p."id" > ${cursor}::uuid`);
  return Prisma.join(clauses, " AND ");
}

export class PrismaGeoSearchRepository implements GeoSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(
    organizationId: string,
    criteria: GeoSearchCriteria,
    cursor: string | undefined,
    limit: number,
  ): Promise<GeoSearchPage> {
    const rows = await this.prisma.$queryRaw<
      (GeoSearchItem & { id: string })[]
    >(Prisma.sql`
      SELECT
        p."id",
        l."id" AS "listingId",
        p."title",
        p."propertyType",
        p."addressText",
        p."latitude",
        p."longitude"
      FROM "Property" p
      INNER JOIN "Listing" l
        ON l."organizationId" = p."organizationId"
       AND l."propertyId" = p."id"
      WHERE ${baseWhere(organizationId, criteria, cursor)}
      ORDER BY p."id" ASC
      LIMIT ${limit + 1}
    `);
    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: hasNext ? encodeCursor(items.at(-1)!.id) : null,
    };
  }

  async cluster(
    organizationId: string,
    criteria: GeoSearchCriteria,
    cellKm: number,
  ): Promise<GeoClusterResult> {
    const cellDegrees = cellKm / 111.32;
    const rows = await this.prisma.$queryRaw<
      { latitude: number; longitude: number; count: number }[]
    >(Prisma.sql`
      WITH matched AS (
        SELECT ST_SnapToGrid(p."location"::geometry, ${cellDegrees}) AS cell
        FROM "Property" p
        INNER JOIN "Listing" l
          ON l."organizationId" = p."organizationId"
         AND l."propertyId" = p."id"
        WHERE ${baseWhere(organizationId, criteria)}
      )
      SELECT
        ST_Y(ST_Centroid(cell)) AS "latitude",
        ST_X(ST_Centroid(cell)) AS "longitude",
        COUNT(*)::int AS "count"
      FROM matched
      GROUP BY cell
      ORDER BY "count" DESC, "latitude" ASC, "longitude" ASC
    `);
    return {
      clusters: rows,
      totalMembers: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }
}
