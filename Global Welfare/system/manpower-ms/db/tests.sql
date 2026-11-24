-- ERD v0.3 database self test. Runs inside a transaction and rolls back, so it leaves nothing behind.
BEGIN;

CREATE TEMP TABLE test_results (label text, ok boolean, detail text);

CREATE FUNCTION pg_temp.u(n text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-0000-0000-' || lpad(n, 12, '0'))::uuid $$;

CREATE FUNCTION pg_temp.must_fail(label text, stmt text, expect text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE succeeded boolean := false; got text := '';
BEGIN
  BEGIN
    EXECUTE stmt;
    succeeded := true;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    got := SQLERRM;
  END;
  INSERT INTO pg_temp.test_results VALUES (label, (NOT succeeded) AND position(expect IN got) > 0, got);
END $$;

-- Fixtures (valid data)
INSERT INTO country (id, iso2_code, name) VALUES (pg_temp.u('a'), 'AA', 'Testland A'), (pg_temp.u('b'), 'BB', 'Testland B');
INSERT INTO city (id, country_id, name, normalized_name) VALUES (pg_temp.u('1a'), pg_temp.u('a'), 'Aville', 'aville'), (pg_temp.u('1b'), pg_temp.u('b'), 'Bville', 'bville');
INSERT INTO job_title (id, title, normalized_title) VALUES (pg_temp.u('20'), 'Cook', 'cook');
INSERT INTO employer (id, registered_country_id, legal_name) VALUES (pg_temp.u('30'), pg_temp.u('a'), 'Acme Test');
INSERT INTO job_demand (id, employer_id, destination_country_id, reference) VALUES (pg_temp.u('40'), pg_temp.u('30'), pg_temp.u('a'), 'TEST-DEMAND');
INSERT INTO job_position (id, demand_id, destination_country_id, city_id, job_title_id, vacancies) VALUES (pg_temp.u('50'), pg_temp.u('40'), pg_temp.u('a'), pg_temp.u('1a'), pg_temp.u('20'), 5);
INSERT INTO job_price_version (id, position_id, currency, effective_from, effective_to, approval_status) VALUES (pg_temp.u('60'), pg_temp.u('50'), 'NPR', '2026-01-01', '2027-01-01', 'APPROVED');
INSERT INTO candidate (id, candidate_code, full_name, name_normalized, updated_at) VALUES
  (pg_temp.u('71'), 'T-1', 'Test One', 'test one', now()), (pg_temp.u('72'), 'T-2', 'Test Two', 'test two', now()), (pg_temp.u('73'), 'T-3', 'Test Three', 'test three', now());
INSERT INTO referral_partner (id, name) VALUES (pg_temp.u('81'), 'Agent One'), (pg_temp.u('82'), 'Agent Two');
INSERT INTO application (id, code, candidate_id, position_id, price_version_id, currency, agreed_amount_snapshot, package_total_snapshot, source_type, referral_partner_id) VALUES
  (pg_temp.u('91'), 'T-APP-1', pg_temp.u('71'), pg_temp.u('50'), pg_temp.u('60'), 'NPR', 200000, 250000, 'REFERRED', pg_temp.u('81')),
  (pg_temp.u('92'), 'T-APP-2', pg_temp.u('72'), pg_temp.u('50'), pg_temp.u('60'), 'NPR', 200000, 250000, 'DIRECT', NULL);
INSERT INTO application_installment (id, application_id, seq, label, expected_amount, due_on) VALUES (pg_temp.u('d1'), pg_temp.u('91'), 1, 'First', 100000, '2026-12-01');
INSERT INTO candidate_payment (id, application_id, installment_id, amount, currency, received_on, method, receipt_number, payer_name)
  VALUES (pg_temp.u('a1'), pg_temp.u('91'), pg_temp.u('d1'), 50000, 'NPR', '2026-11-20', 'CASH', 'T-R1', 'Test Payer');
INSERT INTO expense_category (id, name, normalized_name) VALUES (pg_temp.u('c0'), 'Test category', 'test category');
INSERT INTO company_expense (id, category_id, expense_date, amount, currency, payee, payment_method, description)
  VALUES (pg_temp.u('e1'), pg_temp.u('c0'), '2026-11-20', 1000, 'NPR', 'Bus company', 'CASH', 'Group bus');
INSERT INTO candidate_settlement (id, application_id, revision_no, stop_reason, status, currency, received_total_snapshot, approved_retention_total, refund_due)
  VALUES (pg_temp.u('f1'), pg_temp.u('91'), 1, 'Test stop', 'DRAFT', 'NPR', 50000, 0, 50000);
INSERT INTO partner_commission (id, application_id, partner_id, agreed_amount, currency, approval_status)
  VALUES (pg_temp.u('b1'), pg_temp.u('91'), pg_temp.u('81'), 50000, 'NPR', 'DRAFT');

-- Catalogue integrity
SELECT pg_temp.must_fail('Position: city from another country is rejected',
  $q$INSERT INTO job_position (demand_id, destination_country_id, city_id, job_title_id, vacancies) VALUES (pg_temp.u('40'), pg_temp.u('a'), pg_temp.u('1b'), pg_temp.u('20'), 1)$q$, 'foreign key');
SELECT pg_temp.must_fail('Position: destination differs from its demand country',
  $q$INSERT INTO job_position (demand_id, destination_country_id, city_id, job_title_id, vacancies) VALUES (pg_temp.u('40'), pg_temp.u('b'), pg_temp.u('1b'), pg_temp.u('20'), 1)$q$, 'foreign key');
SELECT pg_temp.must_fail('Price: overlapping approved versions are rejected',
  $q$INSERT INTO job_price_version (position_id, currency, effective_from, effective_to, approval_status) VALUES (pg_temp.u('50'), 'NPR', '2026-06-01', '2027-06-01', 'APPROVED')$q$, 'excl_price_no_overlap');
SELECT pg_temp.must_fail('Price: end date before start date is rejected',
  $q$INSERT INTO job_price_version (position_id, currency, effective_from, effective_to) VALUES (pg_temp.u('50'), 'NPR', '2030-01-01', '2029-01-01')$q$, 'chk_price_dates');
SELECT pg_temp.must_fail('Expense category: duplicate root name is rejected',
  $q$INSERT INTO expense_category (name, normalized_name) VALUES ('Test category', 'test category')$q$, 'uq_expense_category_root_name');

-- Application rules
SELECT pg_temp.must_fail('Application: REFERRED without a partner is rejected',
  $q$INSERT INTO application (code, candidate_id, position_id, price_version_id, currency, agreed_amount_snapshot, package_total_snapshot, source_type) VALUES ('T-X1', pg_temp.u('73'), pg_temp.u('50'), pg_temp.u('60'), 'NPR', 1, 1, 'REFERRED')$q$, 'chk_application_source');
SELECT pg_temp.must_fail('Application: DIRECT with a partner is rejected',
  $q$INSERT INTO application (code, candidate_id, position_id, price_version_id, currency, agreed_amount_snapshot, package_total_snapshot, source_type, referral_partner_id) VALUES ('T-X2', pg_temp.u('73'), pg_temp.u('50'), pg_temp.u('60'), 'NPR', 1, 1, 'DIRECT', pg_temp.u('81'))$q$, 'chk_application_source');
SELECT pg_temp.must_fail('Application: ON_HOLD without a reason is rejected',
  $q$INSERT INTO application (code, candidate_id, position_id, price_version_id, currency, agreed_amount_snapshot, package_total_snapshot, lifecycle_status) VALUES ('T-X3', pg_temp.u('73'), pg_temp.u('50'), pg_temp.u('60'), 'NPR', 1, 1, 'ON_HOLD')$q$, 'chk_application_hold');
SELECT pg_temp.must_fail('Application: second open application for same candidate and position is rejected',
  $q$INSERT INTO application (code, candidate_id, position_id, price_version_id, currency, agreed_amount_snapshot, package_total_snapshot) VALUES ('T-X4', pg_temp.u('71'), pg_temp.u('50'), pg_temp.u('60'), 'NPR', 1, 1)$q$, 'uq_application_open_per_position');
SELECT pg_temp.must_fail('Application: price snapshot cannot be edited',
  $q$UPDATE application SET agreed_amount_snapshot = 1 WHERE id = pg_temp.u('91')$q$, 'cannot be changed');

-- Candidate receipts
SELECT pg_temp.must_fail('Receipt: instalment of another application is rejected',
  $q$INSERT INTO candidate_payment (application_id, installment_id, amount, currency, received_on, method, receipt_number, payer_name) VALUES (pg_temp.u('92'), pg_temp.u('d1'), 100, 'NPR', '2026-11-20', 'CASH', 'T-R2', 'X')$q$, 'fk_payment_installment_same_application');
SELECT pg_temp.must_fail('Receipt: negative amount without a reversal link is rejected',
  $q$INSERT INTO candidate_payment (application_id, amount, currency, received_on, method, receipt_number, payer_name) VALUES (pg_temp.u('91'), -5, 'NPR', '2026-11-20', 'CASH', 'T-R3', 'X')$q$, 'chk_payment_sign');
SELECT pg_temp.must_fail('Receipt: posted receipt cannot be deleted',
  $q$DELETE FROM candidate_payment WHERE id = pg_temp.u('a1')$q$, 'cannot be deleted');
SELECT pg_temp.must_fail('Receipt: posted amount cannot be edited',
  $q$UPDATE candidate_payment SET amount = 1 WHERE id = pg_temp.u('a1')$q$, 'cannot be changed');
INSERT INTO candidate_payment (application_id, amount, currency, received_on, method, receipt_number, payer_name, reverses_payment_id, reversal_reason)
  VALUES (pg_temp.u('91'), -50000, 'NPR', '2026-11-21', 'CASH', 'T-R4', 'Test Payer', pg_temp.u('a1'), 'Entered in error');
SELECT pg_temp.must_fail('Receipt: the same receipt cannot be reversed twice',
  $q$INSERT INTO candidate_payment (application_id, amount, currency, received_on, method, receipt_number, payer_name, reverses_payment_id) VALUES (pg_temp.u('91'), -1, 'NPR', '2026-11-21', 'CASH', 'T-R5', 'X', pg_temp.u('a1'))$q$, 'reverses_payment_id');

-- Shared expense allocation
INSERT INTO company_expense (id, category_id, expense_date, amount, currency, payee, payment_method, description) VALUES (pg_temp.u('e2'), pg_temp.u('c0'), '2026-11-20', 500, 'NPR', 'Clinic', 'CASH', 'Medical');
INSERT INTO expense_allocation (expense_id, application_id, allocated_amount) VALUES (pg_temp.u('e2'), pg_temp.u('92'), 500);
INSERT INTO expense_allocation (expense_id, application_id, allocated_amount) VALUES (pg_temp.u('e1'), pg_temp.u('91'), 600);
SELECT pg_temp.must_fail('Allocation: total above the expense amount is rejected',
  $q$INSERT INTO expense_allocation (expense_id, application_id, allocated_amount) VALUES (pg_temp.u('e1'), pg_temp.u('92'), 600)$q$, 'would exceed');
INSERT INTO expense_allocation (expense_id, application_id, allocated_amount) VALUES (pg_temp.u('e1'), pg_temp.u('92'), 400);

-- Settlement and refunds
SELECT pg_temp.must_fail('Refund: not allowed before the settlement is approved',
  $q$INSERT INTO candidate_refund (settlement_id, amount, currency, paid_on, method) VALUES (pg_temp.u('f1'), 100, 'NPR', '2026-11-22', 'BANK')$q$, 'approved settlement');
UPDATE candidate_settlement SET status = 'APPROVED' WHERE id = pg_temp.u('f1');
SELECT pg_temp.must_fail('Settlement: a second approved settlement for the application is rejected',
  $q$INSERT INTO candidate_settlement (application_id, revision_no, stop_reason, status, currency, received_total_snapshot) VALUES (pg_temp.u('91'), 2, 'Again', 'APPROVED', 'NPR', 1)$q$, 'uq_settlement_one_approved');
SELECT pg_temp.must_fail('Refund: amount above the approved refund due is rejected',
  $q$INSERT INTO candidate_refund (settlement_id, amount, currency, paid_on, method) VALUES (pg_temp.u('f1'), 60000, 'NPR', '2026-11-22', 'BANK')$q$, 'would exceed');
INSERT INTO candidate_refund (settlement_id, amount, currency, paid_on, method) VALUES (pg_temp.u('f1'), 20000, 'NPR', '2026-11-22', 'BANK');
SELECT pg_temp.must_fail('Refund: partial refunds cannot add up above the refund due',
  $q$INSERT INTO candidate_refund (settlement_id, amount, currency, paid_on, method) VALUES (pg_temp.u('f1'), 40000, 'NPR', '2026-11-23', 'BANK')$q$, 'would exceed');
SELECT pg_temp.must_fail('Settlement line: expense type without an expense is rejected',
  $q$INSERT INTO settlement_line (settlement_id, application_id, line_type, amount, basis) VALUES (pg_temp.u('f1'), pg_temp.u('91'), 'EXPENSE', 100, 'Test')$q$, 'chk_line_type');
SELECT pg_temp.must_fail('Settlement line: expense allocated only to another application is rejected',
  $q$INSERT INTO settlement_line (settlement_id, application_id, expense_id, line_type, amount, basis) VALUES (pg_temp.u('f1'), pg_temp.u('91'), pg_temp.u('e2'), 'EXPENSE', 100, 'Test')$q$, 'fk_line_expense_same_application');
INSERT INTO settlement_line (settlement_id, application_id, expense_id, line_type, amount, basis) VALUES (pg_temp.u('f1'), pg_temp.u('91'), pg_temp.u('e1'), 'EXPENSE', 100, 'Test');

-- Agent commission
SELECT pg_temp.must_fail('Commission: a different agent than the application source is rejected',
  $q$INSERT INTO partner_commission (application_id, partner_id, agreed_amount, currency) VALUES (pg_temp.u('92'), pg_temp.u('82'), 1, 'NPR')$q$, 'fk_commission_same_partner');
SELECT pg_temp.must_fail('Commission: payment before approval is rejected',
  $q$INSERT INTO commission_payment (commission_id, amount, currency, paid_on, method) VALUES (pg_temp.u('b1'), 1000, 'NPR', '2026-11-22', 'BANK')$q$, 'after it is approved');
UPDATE partner_commission SET approval_status = 'APPROVED' WHERE id = pg_temp.u('b1');
INSERT INTO commission_payment (commission_id, amount, currency, paid_on, method) VALUES (pg_temp.u('b1'), 30000, 'NPR', '2026-11-22', 'BANK');
SELECT pg_temp.must_fail('Commission: payments above the agreed amount are rejected',
  $q$INSERT INTO commission_payment (commission_id, amount, currency, paid_on, method) VALUES (pg_temp.u('b1'), 30000, 'NPR', '2026-11-23', 'BANK')$q$, 'would exceed');

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, label, CASE WHEN ok THEN '' ELSE left(detail, 120) END AS why
FROM test_results ORDER BY ok, label;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM test_results;

ROLLBACK;
