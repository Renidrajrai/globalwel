-- DropForeignKey
ALTER TABLE "application" DROP CONSTRAINT "application_position_id_fkey";

-- DropForeignKey
ALTER TABLE "application" DROP CONSTRAINT "application_position_id_price_version_id_fkey";

-- DropForeignKey
ALTER TABLE "application" DROP CONSTRAINT "fk_application_assigned_to_id";

-- DropForeignKey
ALTER TABLE "application_source_change" DROP CONSTRAINT "fk_application_source_change_decided_by_id";

-- DropForeignKey
ALTER TABLE "application_source_change" DROP CONSTRAINT "fk_application_source_change_requested_by_id";

-- DropForeignKey
ALTER TABLE "application_status_history" DROP CONSTRAINT "fk_application_status_history_changed_by_id";

-- DropForeignKey
ALTER TABLE "approval_action" DROP CONSTRAINT "fk_approval_action_decided_by_id";

-- DropForeignKey
ALTER TABLE "approval_action" DROP CONSTRAINT "fk_approval_action_requested_by_id";

-- DropForeignKey
ALTER TABLE "candidate" DROP CONSTRAINT "fk_candidate_created_by_id";

-- DropForeignKey
ALTER TABLE "candidate_passport" DROP CONSTRAINT "fk_candidate_passport_created_by_id";

-- DropForeignKey
ALTER TABLE "candidate_payment" DROP CONSTRAINT "fk_candidate_payment_created_by_id";

-- DropForeignKey
ALTER TABLE "candidate_payment" DROP CONSTRAINT "fk_candidate_payment_verified_by_id";

-- DropForeignKey
ALTER TABLE "candidate_payment" DROP CONSTRAINT "fk_payment_installment_same_application";

-- DropForeignKey
ALTER TABLE "candidate_refund" DROP CONSTRAINT "fk_candidate_refund_recorded_by_id";

-- DropForeignKey
ALTER TABLE "candidate_settlement" DROP CONSTRAINT "fk_candidate_settlement_approved_by_id";

-- DropForeignKey
ALTER TABLE "candidate_settlement" DROP CONSTRAINT "fk_candidate_settlement_prepared_by_id";

-- DropForeignKey
ALTER TABLE "commission_amount_history" DROP CONSTRAINT "fk_commission_amount_history_changed_by_id";

-- DropForeignKey
ALTER TABLE "commission_payment" DROP CONSTRAINT "fk_commission_payment_created_by_id";

-- DropForeignKey
ALTER TABLE "company_expense" DROP CONSTRAINT "fk_company_expense_approved_by_id";

-- DropForeignKey
ALTER TABLE "company_expense" DROP CONSTRAINT "fk_company_expense_recorded_by_id";

-- DropForeignKey
ALTER TABLE "country" DROP CONSTRAINT "fk_country_eligibility_verified_by_id";

-- DropForeignKey
ALTER TABLE "expense_category" DROP CONSTRAINT "fk_expense_category_created_by_id";

-- DropForeignKey
ALTER TABLE "job_demand" DROP CONSTRAINT "fk_job_demand_approved_by_id";

-- DropForeignKey
ALTER TABLE "job_price_version" DROP CONSTRAINT "fk_job_price_version_approved_by_id";

-- DropForeignKey
ALTER TABLE "partner_commission" DROP CONSTRAINT "fk_commission_same_partner";

-- DropForeignKey
ALTER TABLE "partner_commission" DROP CONSTRAINT "fk_partner_commission_approved_by_id";

-- DropForeignKey
ALTER TABLE "settlement_line" DROP CONSTRAINT "fk_line_expense_same_application";

-- DropForeignKey
ALTER TABLE "settlement_line" DROP CONSTRAINT "fk_settlement_line_approved_by_id";

-- AlterTable
ALTER TABLE "application" ALTER COLUMN "position_id" DROP NOT NULL,
ALTER COLUMN "price_version_id" DROP NOT NULL,
ALTER COLUMN "currency" DROP NOT NULL,
ALTER COLUMN "agreed_amount_snapshot" DROP NOT NULL,
ALTER COLUMN "package_total_snapshot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "alt_phone_digits" TEXT,
ADD COLUMN     "phone_digits" TEXT;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "job_position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_position_id_price_version_id_fkey" FOREIGN KEY ("position_id", "price_version_id") REFERENCES "job_price_version"("position_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;
