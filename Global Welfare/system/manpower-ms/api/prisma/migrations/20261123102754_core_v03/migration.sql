-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "eligibility_status" AS ENUM ('NOT_REVIEWED', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('DIRECT', 'REFERRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "lifecycle_status" AS ENUM ('ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT', 'CLOSED_SUCCESSFULLY', 'CLOSED_UNSUCCESSFULLY');

-- CreateEnum
CREATE TYPE "payer_type" AS ENUM ('CANDIDATE', 'EMPLOYER', 'COMPANY');

-- CreateEnum
CREATE TYPE "settlement_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "settlement_line_type" AS ENUM ('EXPENSE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "country" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "iso2_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "eligibility" "eligibility_status" NOT NULL DEFAULT 'NOT_REVIEWED',
    "eligibility_source" TEXT,
    "eligibility_verified_at" TIMESTAMPTZ(3),
    "eligibility_verified_by_id" UUID,
    "approval_status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "city_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_title" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "job_title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registered_country_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "reference" TEXT,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_demand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employer_id" UUID NOT NULL,
    "destination_country_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "feims_reference" TEXT,
    "approval_status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "expires_on" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demand_id" UUID NOT NULL,
    "destination_country_id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "vacancies" INTEGER NOT NULL,
    "salary_amount" DECIMAL(14,2),
    "salary_currency" VARCHAR(3),
    "terms" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_price_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "position_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NPR',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "approval_status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "change_reason" TEXT,
    "compliance_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_price_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_component" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "price_version_id" UUID NOT NULL,
    "component_type" TEXT NOT NULL,
    "payer" "payer_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "price_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidate_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "date_of_birth" DATE,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_partner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "partner_type" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "candidate_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "price_version_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "agreed_amount_snapshot" DECIMAL(14,2) NOT NULL,
    "package_total_snapshot" DECIMAL(14,2) NOT NULL,
    "source_type" "source_type" NOT NULL DEFAULT 'DIRECT',
    "referral_partner_id" UUID,
    "lifecycle_status" "lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "hold_reason" TEXT,
    "next_review_on" DATE,
    "assigned_to_id" UUID,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_price_component" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "component_type" TEXT NOT NULL,
    "payer" "payer_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "application_price_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "from_status" "lifecycle_status",
    "to_status" "lifecycle_status" NOT NULL,
    "reason" TEXT,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_source_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "old_source_type" "source_type" NOT NULL,
    "old_partner_id" UUID,
    "new_source_type" "source_type" NOT NULL,
    "new_partner_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "application_source_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plan_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plan_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plan_installment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "share_percent" DECIMAL(5,2),
    "fixed_amount" DECIMAL(14,2),

    CONSTRAINT "payment_plan_installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_installment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "expected_amount" DECIMAL(14,2) NOT NULL,
    "due_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "installment_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "received_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "bank_reference" TEXT,
    "payer_name" TEXT NOT NULL,
    "payer_relationship" TEXT,
    "note" TEXT,
    "reverses_payment_id" UUID,
    "reversal_reason" TEXT,
    "created_by_id" UUID,
    "verified_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_expense" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "expense_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payee" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "reverses_expense_id" UUID,
    "reversal_reason" TEXT,
    "recorded_by_id" UUID,
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_allocation" (
    "expense_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "expense_allocation_pkey" PRIMARY KEY ("expense_id","application_id")
);

-- CreateTable
CREATE TABLE "partner_commission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "agreed_amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payable_when" TEXT,
    "approval_status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_amount_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commission_id" UUID NOT NULL,
    "old_amount" DECIMAL(14,2),
    "new_amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_amount_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commission_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "bank_reference" TEXT,
    "reverses_payment_id" UUID,
    "reversal_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_settlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "stop_reason" TEXT NOT NULL,
    "status" "settlement_status" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL,
    "received_total_snapshot" DECIMAL(14,2) NOT NULL,
    "approved_retention_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refund_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prepared_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "expense_id" UUID,
    "line_type" "settlement_line_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "basis" TEXT NOT NULL,
    "approval_status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,

    CONSTRAINT "settlement_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_refund" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "bank_reference" TEXT,
    "reverses_refund_id" UUID,
    "reversal_reason" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_action" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "decision" "request_status" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requested_by_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "approval_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_iso2_code_key" ON "country"("iso2_code");

-- CreateIndex
CREATE UNIQUE INDEX "city_country_id_normalized_name_key" ON "city"("country_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "city_id_country_id_key" ON "city"("id", "country_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_title_normalized_title_key" ON "job_title"("normalized_title");

-- CreateIndex
CREATE UNIQUE INDEX "job_demand_reference_key" ON "job_demand"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "job_demand_id_destination_country_id_key" ON "job_demand"("id", "destination_country_id");

-- CreateIndex
CREATE INDEX "job_position_demand_id_idx" ON "job_position"("demand_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_position_id_destination_country_id_key" ON "job_position"("id", "destination_country_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_price_version_position_id_id_key" ON "job_price_version"("position_id", "id");

-- CreateIndex
CREATE INDEX "price_component_price_version_id_idx" ON "price_component"("price_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_candidate_code_key" ON "candidate"("candidate_code");

-- CreateIndex
CREATE INDEX "candidate_name_normalized_date_of_birth_idx" ON "candidate"("name_normalized", "date_of_birth");

-- CreateIndex
CREATE UNIQUE INDEX "application_code_key" ON "application"("code");

-- CreateIndex
CREATE INDEX "application_candidate_id_idx" ON "application"("candidate_id");

-- CreateIndex
CREATE INDEX "application_position_id_idx" ON "application"("position_id");

-- CreateIndex
CREATE INDEX "application_lifecycle_status_idx" ON "application"("lifecycle_status");

-- CreateIndex
CREATE UNIQUE INDEX "application_id_referral_partner_id_key" ON "application"("id", "referral_partner_id");

-- CreateIndex
CREATE INDEX "application_price_component_application_id_idx" ON "application_price_component"("application_id");

-- CreateIndex
CREATE INDEX "application_status_history_application_id_idx" ON "application_status_history"("application_id");

-- CreateIndex
CREATE INDEX "application_source_change_application_id_idx" ON "application_source_change"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plan_template_name_key" ON "payment_plan_template"("name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plan_installment_plan_id_seq_key" ON "payment_plan_installment"("plan_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "application_installment_application_id_seq_key" ON "application_installment"("application_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "application_installment_id_application_id_key" ON "application_installment"("id", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_payment_receipt_number_key" ON "candidate_payment"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_payment_reverses_payment_id_key" ON "candidate_payment"("reverses_payment_id");

-- CreateIndex
CREATE INDEX "candidate_payment_application_id_idx" ON "candidate_payment"("application_id");

-- CreateIndex
CREATE INDEX "candidate_payment_received_on_idx" ON "candidate_payment"("received_on");

-- CreateIndex
CREATE UNIQUE INDEX "expense_category_parent_id_normalized_name_key" ON "expense_category"("parent_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "company_expense_reverses_expense_id_key" ON "company_expense"("reverses_expense_id");

-- CreateIndex
CREATE INDEX "company_expense_expense_date_idx" ON "company_expense"("expense_date");

-- CreateIndex
CREATE INDEX "company_expense_category_id_idx" ON "company_expense"("category_id");

-- CreateIndex
CREATE INDEX "expense_allocation_application_id_idx" ON "expense_allocation"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_commission_application_id_key" ON "partner_commission"("application_id");

-- CreateIndex
CREATE INDEX "commission_amount_history_commission_id_idx" ON "commission_amount_history"("commission_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_payment_reverses_payment_id_key" ON "commission_payment"("reverses_payment_id");

-- CreateIndex
CREATE INDEX "commission_payment_commission_id_idx" ON "commission_payment"("commission_id");

-- CreateIndex
CREATE INDEX "commission_payment_paid_on_idx" ON "commission_payment"("paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_settlement_application_id_revision_no_key" ON "candidate_settlement"("application_id", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_settlement_id_application_id_key" ON "candidate_settlement"("id", "application_id");

-- CreateIndex
CREATE INDEX "settlement_line_settlement_id_idx" ON "settlement_line"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_refund_reverses_refund_id_key" ON "candidate_refund"("reverses_refund_id");

-- CreateIndex
CREATE INDEX "candidate_refund_settlement_id_idx" ON "candidate_refund"("settlement_id");

-- CreateIndex
CREATE INDEX "candidate_refund_paid_on_idx" ON "candidate_refund"("paid_on");

-- CreateIndex
CREATE INDEX "approval_action_entity_type_entity_id_idx" ON "approval_action"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "city" ADD CONSTRAINT "city_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer" ADD CONSTRAINT "employer_registered_country_id_fkey" FOREIGN KEY ("registered_country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_demand" ADD CONSTRAINT "job_demand_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_demand" ADD CONSTRAINT "job_demand_destination_country_id_fkey" FOREIGN KEY ("destination_country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_position" ADD CONSTRAINT "job_position_demand_id_destination_country_id_fkey" FOREIGN KEY ("demand_id", "destination_country_id") REFERENCES "job_demand"("id", "destination_country_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_position" ADD CONSTRAINT "job_position_city_id_destination_country_id_fkey" FOREIGN KEY ("city_id", "destination_country_id") REFERENCES "city"("id", "country_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_position" ADD CONSTRAINT "job_position_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_price_version" ADD CONSTRAINT "job_price_version_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "job_position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_component" ADD CONSTRAINT "price_component_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "job_price_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "job_position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_position_id_price_version_id_fkey" FOREIGN KEY ("position_id", "price_version_id") REFERENCES "job_price_version"("position_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_referral_partner_id_fkey" FOREIGN KEY ("referral_partner_id") REFERENCES "referral_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_price_component" ADD CONSTRAINT "application_price_component_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_source_change" ADD CONSTRAINT "application_source_change_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_source_change" ADD CONSTRAINT "application_source_change_new_partner_id_fkey" FOREIGN KEY ("new_partner_id") REFERENCES "referral_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plan_installment" ADD CONSTRAINT "payment_plan_installment_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payment_plan_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_installment" ADD CONSTRAINT "application_installment_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_payment" ADD CONSTRAINT "candidate_payment_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_payment" ADD CONSTRAINT "candidate_payment_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "application_installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_payment" ADD CONSTRAINT "candidate_payment_reverses_payment_id_fkey" FOREIGN KEY ("reverses_payment_id") REFERENCES "candidate_payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "expense_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_expense" ADD CONSTRAINT "company_expense_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_expense" ADD CONSTRAINT "company_expense_reverses_expense_id_fkey" FOREIGN KEY ("reverses_expense_id") REFERENCES "company_expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocation" ADD CONSTRAINT "expense_allocation_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "company_expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocation" ADD CONSTRAINT "expense_allocation_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commission" ADD CONSTRAINT "partner_commission_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commission" ADD CONSTRAINT "partner_commission_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "referral_partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_amount_history" ADD CONSTRAINT "commission_amount_history_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "partner_commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payment" ADD CONSTRAINT "commission_payment_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "partner_commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payment" ADD CONSTRAINT "commission_payment_reverses_payment_id_fkey" FOREIGN KEY ("reverses_payment_id") REFERENCES "commission_payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_settlement" ADD CONSTRAINT "candidate_settlement_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_line" ADD CONSTRAINT "settlement_line_settlement_id_application_id_fkey" FOREIGN KEY ("settlement_id", "application_id") REFERENCES "candidate_settlement"("id", "application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_refund" ADD CONSTRAINT "candidate_refund_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "candidate_settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_refund" ADD CONSTRAINT "candidate_refund_reverses_refund_id_fkey" FOREIGN KEY ("reverses_refund_id") REFERENCES "candidate_refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- Integrity rules that Prisma cannot express.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. People columns stored as plain uuid are linked to app_user here.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('country', 'eligibility_verified_by_id'),
    ('job_demand', 'approved_by_id'),
    ('job_price_version', 'approved_by_id'),
    ('candidate', 'created_by_id'),
    ('application', 'assigned_to_id'),
    ('application_status_history', 'changed_by_id'),
    ('application_source_change', 'requested_by_id'),
    ('application_source_change', 'decided_by_id'),
    ('candidate_payment', 'created_by_id'),
    ('candidate_payment', 'verified_by_id'),
    ('expense_category', 'created_by_id'),
    ('company_expense', 'recorded_by_id'),
    ('company_expense', 'approved_by_id'),
    ('partner_commission', 'approved_by_id'),
    ('commission_amount_history', 'changed_by_id'),
    ('commission_payment', 'created_by_id'),
    ('candidate_settlement', 'prepared_by_id'),
    ('candidate_settlement', 'approved_by_id'),
    ('settlement_line', 'approved_by_id'),
    ('candidate_refund', 'recorded_by_id'),
    ('approval_action', 'requested_by_id'),
    ('approval_action', 'decided_by_id')
  ) AS t(tbl, col)
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES app_user (id)',
      r.tbl, 'fk_' || r.tbl || '_' || r.col, r.col);
  END LOOP;
END $$;

-- 2. Composite foreign keys (same application, same partner, same allocation).
ALTER TABLE candidate_payment
  ADD CONSTRAINT fk_payment_installment_same_application
  FOREIGN KEY (installment_id, application_id)
  REFERENCES application_installment (id, application_id);

ALTER TABLE partner_commission
  ADD CONSTRAINT fk_commission_same_partner
  FOREIGN KEY (application_id, partner_id)
  REFERENCES application (id, referral_partner_id);

ALTER TABLE settlement_line
  ADD CONSTRAINT fk_line_expense_same_application
  FOREIGN KEY (expense_id, application_id)
  REFERENCES expense_allocation (expense_id, application_id);

-- 3. Row checks.
ALTER TABLE application ADD CONSTRAINT chk_application_source CHECK (
  (source_type = 'REFERRED' AND referral_partner_id IS NOT NULL) OR
  (source_type <> 'REFERRED' AND referral_partner_id IS NULL));
ALTER TABLE application ADD CONSTRAINT chk_application_hold
  CHECK (lifecycle_status <> 'ON_HOLD' OR hold_reason IS NOT NULL);
ALTER TABLE application ADD CONSTRAINT chk_application_amounts
  CHECK (agreed_amount_snapshot >= 0 AND package_total_snapshot >= agreed_amount_snapshot);

ALTER TABLE job_position ADD CONSTRAINT chk_position_vacancies CHECK (vacancies >= 0);
ALTER TABLE job_price_version ADD CONSTRAINT chk_price_dates
  CHECK (effective_to IS NULL OR effective_to > effective_from);
ALTER TABLE job_price_version ADD CONSTRAINT excl_price_no_overlap
  EXCLUDE USING gist (position_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&)
  WHERE (approval_status = 'APPROVED');

ALTER TABLE price_component ADD CONSTRAINT chk_price_component_amount CHECK (amount >= 0);
ALTER TABLE application_price_component ADD CONSTRAINT chk_app_price_component_amount CHECK (amount >= 0);

ALTER TABLE payment_plan_installment ADD CONSTRAINT chk_plan_installment_basis CHECK (
  (share_percent IS NOT NULL) <> (fixed_amount IS NOT NULL)
  AND (share_percent IS NULL OR (share_percent >= 0 AND share_percent <= 100))
  AND (fixed_amount IS NULL OR fixed_amount >= 0));
ALTER TABLE application_installment ADD CONSTRAINT chk_app_installment
  CHECK (expected_amount >= 0 AND seq > 0);

ALTER TABLE candidate_payment ADD CONSTRAINT chk_payment_sign CHECK (
  (reverses_payment_id IS NULL AND amount > 0) OR (reverses_payment_id IS NOT NULL AND amount < 0));
ALTER TABLE company_expense ADD CONSTRAINT chk_expense_sign CHECK (
  (reverses_expense_id IS NULL AND amount > 0) OR (reverses_expense_id IS NOT NULL AND amount < 0));
ALTER TABLE commission_payment ADD CONSTRAINT chk_commission_payment_sign CHECK (
  (reverses_payment_id IS NULL AND amount > 0) OR (reverses_payment_id IS NOT NULL AND amount < 0));
ALTER TABLE candidate_refund ADD CONSTRAINT chk_refund_sign CHECK (
  (reverses_refund_id IS NULL AND amount > 0) OR (reverses_refund_id IS NOT NULL AND amount < 0));

ALTER TABLE expense_allocation ADD CONSTRAINT chk_allocation_amount CHECK (allocated_amount > 0);
ALTER TABLE partner_commission ADD CONSTRAINT chk_commission_amount CHECK (agreed_amount >= 0);
ALTER TABLE candidate_settlement ADD CONSTRAINT chk_settlement_amounts CHECK (
  received_total_snapshot >= 0 AND approved_retention_total >= 0
  AND approved_retention_total <= received_total_snapshot AND refund_due >= 0);
ALTER TABLE settlement_line ADD CONSTRAINT chk_line_type
  CHECK ((line_type = 'EXPENSE') = (expense_id IS NOT NULL));
ALTER TABLE settlement_line ADD CONSTRAINT chk_line_amount CHECK (amount >= 0);

-- 4. Partial unique indexes.
CREATE UNIQUE INDEX uq_application_open_per_position ON application (candidate_id, position_id)
  WHERE lifecycle_status IN ('ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT');
CREATE UNIQUE INDEX uq_settlement_one_approved ON candidate_settlement (application_id)
  WHERE status = 'APPROVED';
CREATE UNIQUE INDEX uq_expense_category_root_name ON expense_category (normalized_name)
  WHERE parent_id IS NULL;

-- 5. Posted money rows: no delete, no change to amount or currency.
CREATE FUNCTION trg_money_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rows in % cannot be deleted. Post a reversal instead.', TG_TABLE_NAME;
  END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Amount and currency in % cannot be changed. Post a reversal instead.', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER candidate_payment_immutable BEFORE UPDATE OR DELETE ON candidate_payment
  FOR EACH ROW EXECUTE FUNCTION trg_money_immutable();
CREATE TRIGGER company_expense_immutable BEFORE UPDATE OR DELETE ON company_expense
  FOR EACH ROW EXECUTE FUNCTION trg_money_immutable();
CREATE TRIGGER commission_payment_immutable BEFORE UPDATE OR DELETE ON commission_payment
  FOR EACH ROW EXECUTE FUNCTION trg_money_immutable();
CREATE TRIGGER candidate_refund_immutable BEFORE UPDATE OR DELETE ON candidate_refund
  FOR EACH ROW EXECUTE FUNCTION trg_money_immutable();

-- 6. Application identity and price snapshot cannot be edited.
CREATE FUNCTION trg_application_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.candidate_id <> OLD.candidate_id OR NEW.position_id <> OLD.position_id
     OR NEW.price_version_id <> OLD.price_version_id
     OR NEW.agreed_amount_snapshot <> OLD.agreed_amount_snapshot
     OR NEW.package_total_snapshot <> OLD.package_total_snapshot
     OR NEW.currency <> OLD.currency THEN
    RAISE EXCEPTION 'The candidate, position and price snapshot of an application cannot be changed.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER application_snapshot_locked BEFORE UPDATE ON application
  FOR EACH ROW EXECUTE FUNCTION trg_application_snapshot();

-- 7. Aggregate limits. Each locks the parent row so two users cannot both pass.
CREATE FUNCTION trg_allocation_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cap numeric; others numeric;
BEGIN
  SELECT amount INTO cap FROM company_expense WHERE id = NEW.expense_id FOR UPDATE;
  IF cap IS NULL THEN RAISE EXCEPTION 'Expense not found.'; END IF;
  SELECT COALESCE(SUM(allocated_amount), 0) INTO others
    FROM expense_allocation
    WHERE expense_id = NEW.expense_id AND application_id <> NEW.application_id;
  IF others + NEW.allocated_amount > cap THEN
    RAISE EXCEPTION 'Allocations (%) would exceed the expense amount (%).', others + NEW.allocated_amount, cap;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expense_allocation_cap BEFORE INSERT OR UPDATE ON expense_allocation
  FOR EACH ROW EXECUTE FUNCTION trg_allocation_cap();

CREATE FUNCTION trg_refund_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE due numeric; st text; paid numeric;
BEGIN
  SELECT refund_due, status::text INTO due, st
    FROM candidate_settlement WHERE id = NEW.settlement_id FOR UPDATE;
  IF st IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'Refunds can only be recorded against an approved settlement.';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM candidate_refund WHERE settlement_id = NEW.settlement_id;
  IF paid + NEW.amount > due THEN
    RAISE EXCEPTION 'Refunds (%) would exceed the approved refund due (%).', paid + NEW.amount, due;
  END IF;
  IF paid + NEW.amount < 0 THEN
    RAISE EXCEPTION 'A reversal cannot take total refunds below zero.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER candidate_refund_cap BEFORE INSERT ON candidate_refund
  FOR EACH ROW EXECUTE FUNCTION trg_refund_cap();

CREATE FUNCTION trg_commission_payment_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE due numeric; st text; paid numeric;
BEGIN
  SELECT agreed_amount, approval_status::text INTO due, st
    FROM partner_commission WHERE id = NEW.commission_id FOR UPDATE;
  IF st IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'Commission can only be paid after it is approved.';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM commission_payment WHERE commission_id = NEW.commission_id;
  IF paid + NEW.amount > due THEN
    RAISE EXCEPTION 'Payments (%) would exceed the agreed commission (%).', paid + NEW.amount, due;
  END IF;
  IF paid + NEW.amount < 0 THEN
    RAISE EXCEPTION 'A reversal cannot take total commission paid below zero.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commission_payment_cap BEFORE INSERT ON commission_payment
  FOR EACH ROW EXECUTE FUNCTION trg_commission_payment_cap();
