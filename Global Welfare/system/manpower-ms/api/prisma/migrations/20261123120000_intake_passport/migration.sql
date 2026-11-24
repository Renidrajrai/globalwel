-- AlterTable
ALTER TABLE "application_source_change" ADD COLUMN "decision_reason" TEXT;

-- CreateTable
CREATE TABLE "candidate_passport" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidate_id" UUID NOT NULL,
    "passport_number_ciphertext" TEXT NOT NULL,
    "passport_lookup_hmac" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "issuing_country_id" UUID,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_passport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_passport_passport_lookup_hmac_key" ON "candidate_passport"("passport_lookup_hmac");
CREATE INDEX "candidate_passport_candidate_id_idx" ON "candidate_passport"("candidate_id");

-- AddForeignKey
ALTER TABLE "candidate_passport" ADD CONSTRAINT "candidate_passport_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity
CREATE SEQUENCE IF NOT EXISTS candidate_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS application_code_seq START 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_one_current_passport
  ON candidate_passport (candidate_id) WHERE is_current;

ALTER TABLE candidate_passport
  ADD CONSTRAINT chk_passport_dates CHECK (expiry_date >= issue_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_source_change
  ON application_source_change (application_id) WHERE status = 'PENDING';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_passport_created_by_id') THEN
    ALTER TABLE candidate_passport ADD CONSTRAINT fk_candidate_passport_created_by_id
      FOREIGN KEY (created_by_id) REFERENCES app_user (id);
  END IF;
END $$;
