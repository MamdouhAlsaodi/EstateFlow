-- EF-510: normalized coordinates and indexed PostGIS geography for listings.
ALTER TABLE "Property"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "location" geography(Point, 4326);

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_coordinates_pair_check"
  CHECK (("latitude" IS NULL AND "longitude" IS NULL)
      OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)),
  ADD CONSTRAINT "Property_latitude_range_check"
  CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "Property_longitude_range_check"
  CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

CREATE OR REPLACE FUNCTION estateflow_sync_property_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."location" := NULL;
  ELSE
    NEW."location" := ST_SetSRID(
      ST_MakePoint(NEW."longitude", NEW."latitude"),
      4326
    )::geography;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Property_sync_location_trigger"
BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "Property"
FOR EACH ROW EXECUTE FUNCTION estateflow_sync_property_location();

CREATE INDEX "Property_location_gist_idx"
ON "Property" USING GIST ("location");
CREATE INDEX "Property_organizationId_latitude_longitude_idx"
ON "Property" ("organizationId", "latitude", "longitude");
