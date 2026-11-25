-- Keep historical country eligibility columns intact, but remove their role grants.
DELETE FROM "role_permission"
WHERE "permission_id" IN (SELECT "id" FROM "permission" WHERE "code" = 'catalogue.eligibility.manage');

CREATE SEQUENCE "job_demand_reference_seq";
DO $$
DECLARE latest BIGINT;
BEGIN
  SELECT MAX(split_part("reference", '-', 3)::BIGINT) INTO latest
  FROM "job_demand"
  WHERE "reference" ~ '^DMD-[0-9]{4}-[0-9]+$';
  IF latest IS NULL THEN
    PERFORM setval('job_demand_reference_seq', 1, false);
  ELSE
    PERFORM setval('job_demand_reference_seq', latest, true);
  END IF;
END $$;

CREATE TABLE "employer_job_title" (
  "employer_id" UUID NOT NULL,
  "job_title_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employer_job_title_pkey" PRIMARY KEY ("employer_id", "job_title_id")
);
CREATE INDEX "employer_job_title_job_title_id_idx" ON "employer_job_title"("job_title_id");
ALTER TABLE "employer_job_title"
  ADD CONSTRAINT "employer_job_title_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employer_job_title_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
