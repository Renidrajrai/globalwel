-- An application may exist without a position (all-or-nothing price snapshot)
ALTER TABLE application ADD CONSTRAINT chk_application_priced_together CHECK (
  (position_id IS NULL AND price_version_id IS NULL AND currency IS NULL
     AND agreed_amount_snapshot IS NULL AND package_total_snapshot IS NULL)
  OR
  (position_id IS NOT NULL AND price_version_id IS NOT NULL AND currency IS NOT NULL
     AND agreed_amount_snapshot IS NOT NULL AND package_total_snapshot IS NOT NULL)
);

CREATE UNIQUE INDEX uq_one_open_unassigned_application ON application (candidate_id)
  WHERE position_id IS NULL AND lifecycle_status IN ('ACTIVE','ON_HOLD','STOPPED_PENDING_SETTLEMENT');

CREATE OR REPLACE FUNCTION trg_application_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id THEN
    RAISE EXCEPTION 'The candidate, position and price snapshot of an application cannot be changed.';
  END IF;
  IF OLD.position_id IS NOT NULL AND (
       NEW.position_id IS DISTINCT FROM OLD.position_id
    OR NEW.price_version_id IS DISTINCT FROM OLD.price_version_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.agreed_amount_snapshot IS DISTINCT FROM OLD.agreed_amount_snapshot
    OR NEW.package_total_snapshot IS DISTINCT FROM OLD.package_total_snapshot) THEN
    RAISE EXCEPTION 'The candidate, position and price snapshot of an application cannot be changed.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION candidate_set_phone_digits() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone_digits     := NULLIF(regexp_replace(coalesce(NEW.phone, ''),     '\D', '', 'g'), '');
  NEW.alt_phone_digits := NULLIF(regexp_replace(coalesce(NEW.alt_phone, ''), '\D', '', 'g'), '');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_candidate_phone_digits
  BEFORE INSERT OR UPDATE OF phone, alt_phone ON candidate
  FOR EACH ROW EXECUTE FUNCTION candidate_set_phone_digits();
UPDATE candidate SET phone = phone;

ALTER TABLE candidate_passport DROP CONSTRAINT IF EXISTS chk_passport_dates;
ALTER TABLE candidate_passport ADD CONSTRAINT chk_passport_dates CHECK (expiry_date > issue_date) NOT VALID;

CREATE OR REPLACE FUNCTION passport_dates_vs_dob() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dob date;
BEGIN
  SELECT date_of_birth INTO dob FROM candidate WHERE id = NEW.candidate_id;
  IF dob IS NOT NULL AND NEW.issue_date < dob THEN
    RAISE EXCEPTION 'Passport issue date is before the date of birth';
  END IF;
  IF NEW.issue_date > (now() AT TIME ZONE 'Asia/Kathmandu')::date THEN
    RAISE EXCEPTION 'Passport issue date is in the future';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_passport_dates BEFORE INSERT ON candidate_passport
  FOR EACH ROW EXECUTE FUNCTION passport_dates_vs_dob();

INSERT INTO country (iso2_code, name, active, eligibility, approval_status)
VALUES ('NP', 'Nepal', true, 'NOT_REVIEWED', 'APPROVED')
ON CONFLICT (iso2_code) DO NOTHING;
