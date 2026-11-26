-- Restore database integrity constraints removed when Prisma regenerated its foreign keys.
-- Deliberately fail on pre-existing violations; this migration never deletes or repairs data.
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

ALTER TABLE application
  ADD CONSTRAINT chk_selected_needs_position
  CHECK (selected_at IS NULL OR position_id IS NOT NULL);

ALTER TABLE job_demand
  ADD CONSTRAINT fk_demand_employer_agency
  FOREIGN KEY (employer_id, overseas_agency_id)
  REFERENCES employer_overseas_agency (employer_id, overseas_agency_id);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('country','eligibility_verified_by_id'),('job_demand','approved_by_id'),('job_price_version','approved_by_id'),
    ('candidate','created_by_id'),('candidate_passport','created_by_id'),('application','assigned_to_id'),
    ('application_status_history','changed_by_id'),('application_source_change','requested_by_id'),
    ('application_source_change','decided_by_id'),('candidate_payment','created_by_id'),('candidate_payment','verified_by_id'),
    ('expense_category','created_by_id'),('company_expense','recorded_by_id'),('company_expense','approved_by_id'),
    ('partner_commission','approved_by_id'),('commission_amount_history','changed_by_id'),('commission_payment','created_by_id'),
    ('candidate_settlement','prepared_by_id'),('candidate_settlement','approved_by_id'),('settlement_line','approved_by_id'),
    ('candidate_refund','recorded_by_id'),('approval_action','requested_by_id'),('approval_action','decided_by_id')
  ) AS t(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES app_user (id)', r.tbl, 'fk_' || r.tbl || '_' || r.col, r.col);
  END LOOP;
END $$;
