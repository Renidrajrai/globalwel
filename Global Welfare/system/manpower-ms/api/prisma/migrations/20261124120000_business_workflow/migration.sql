CREATE TYPE "business_region" AS ENUM ('EUROPE', 'GULF');
CREATE TYPE "selection_document_status" AS ENUM ('PENDING', 'DONE');

ALTER TABLE "country"
  ADD COLUMN "business_region" "business_region",
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "overseas_agency" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "country_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "contact_name" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overseas_agency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employer_overseas_agency" (
  "employer_id" UUID NOT NULL,
  "overseas_agency_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employer_overseas_agency_pkey" PRIMARY KEY ("employer_id", "overseas_agency_id")
);

CREATE TABLE "employer_destination_country" (
  "employer_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employer_destination_country_pkey" PRIMARY KEY ("employer_id", "country_id")
);

ALTER TABLE "job_demand" ADD COLUMN "overseas_agency_id" UUID;
ALTER TABLE "job_position" ALTER COLUMN "city_id" DROP NOT NULL;
ALTER TABLE "candidate" ADD COLUMN "next_of_kin" TEXT, ADD COLUMN "refer_id" UUID;
ALTER TABLE "referral_partner" ADD COLUMN "notes" TEXT;
ALTER TABLE "application"
  ADD COLUMN "selected_at" TIMESTAMPTZ(3),
  ADD COLUMN "photo_status" "selection_document_status",
  ADD COLUMN "pcc_status" "selection_document_status",
  ADD COLUMN "medical_status" "selection_document_status",
  ADD COLUMN "selection_remarks" TEXT;

CREATE INDEX "overseas_agency_country_id_active_idx" ON "overseas_agency"("country_id", "active");
CREATE INDEX "employer_overseas_agency_overseas_agency_id_idx" ON "employer_overseas_agency"("overseas_agency_id");
CREATE INDEX "employer_destination_country_country_id_idx" ON "employer_destination_country"("country_id");
CREATE INDEX "candidate_refer_id_idx" ON "candidate"("refer_id");
CREATE INDEX "application_selected_at_idx" ON "application"("selected_at");

ALTER TABLE "overseas_agency" ADD CONSTRAINT "overseas_agency_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employer_overseas_agency" ADD CONSTRAINT "employer_overseas_agency_employer_id_fkey"
  FOREIGN KEY ("employer_id") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employer_overseas_agency" ADD CONSTRAINT "employer_overseas_agency_overseas_agency_id_fkey"
  FOREIGN KEY ("overseas_agency_id") REFERENCES "overseas_agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employer_destination_country" ADD CONSTRAINT "employer_destination_country_employer_id_fkey"
  FOREIGN KEY ("employer_id") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employer_destination_country" ADD CONSTRAINT "employer_destination_country_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_demand" ADD CONSTRAINT "job_demand_overseas_agency_id_fkey"
  FOREIGN KEY ("overseas_agency_id") REFERENCES "overseas_agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_refer_id_fkey"
  FOREIGN KEY ("refer_id") REFERENCES "referral_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permission" ("id", "code", "description")
VALUES (gen_random_uuid(), 'selection.manage', 'Select applicants for recruitment demands and update selection document status')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r CROSS JOIN "permission" p
WHERE r."code" IN ('CEO', 'RECRUITMENT_OFFICER', 'PROCESSING_OFFICER')
  AND p."code" = 'selection.manage'
ON CONFLICT DO NOTHING;
