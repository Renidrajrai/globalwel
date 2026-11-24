import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';
import { ApiError } from '../lib/api';
import { postJson, useJson, useResource } from '../lib/useApi';

type Lookup = { found: boolean; candidateId?: string; fullName?: string; candidateCode?: string; passportStatus?: string; openApplications?: number };
type IntakeOptions = { countries: { id: string; name: string; iso2Code: string }[]; referralPartners: { id: string; name: string }[] };
type Duplicate = { id: string; fullName: string; candidateCode: string };
type IntakePosition = { id: string; label: string; employer: string; vacancies: number; currency: string; agreedAmount: string };
const control = 'body-3 w-full rounded-lg border border-line bg-bg px-3 py-2';

export default function IntakePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canCreateApplication = can('application.create');
  const { data: positions, loading, error, reload } = useJson<IntakePosition[]>(canCreateApplication ? '/intake/positions' : '');
  const { data: blockedPositions } = useResource<any>(canCreateApplication && positions?.length === 0 ? 'positions' : '', undefined, 1, 200);
  const { data: options, loading: optionsLoading, error: optionsError, reload: reloadOptions } = useJson<IntakeOptions>(canCreateApplication ? '/intake/options' : '');
  const [passportNumber, setPassportNumber] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '', dateOfBirth: '', phone: '', altPhone: '', email: '', address: '',
    issueDate: '', expiryDate: '', issuingCountryId: '', positionId: '', sourceType: 'DIRECT', referralPartnerId: '',
  });

  useEffect(() => {
    if (!form.issuingCountryId && options?.countries.length) {
      const nepal = options.countries.find((country) => country.iso2Code === 'NP');
      if (nepal) setForm((current) => ({ ...current, issuingCountryId: nepal.id }));
    }
  }, [form.issuingCountryId, options]);

  const set = (key: string, value: string) => {
    setDuplicates([]);
    setForm((current) => ({ ...current, [key]: value, ...(key === 'sourceType' && value !== 'REFERRED' ? { referralPartnerId: '' } : {}) }));
  };

  if (!can('candidate.create') || !canCreateApplication) return <EmptyState title="Intake requires both candidate and application access." hint="Ask an administrator to assign the required permissions." />;

  async function doLookup(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true); setLookup(null);
    try { setLookup(await postJson<Lookup>('/intake/passport-lookup', { passportNumber, issuingCountryId: form.issuingCountryId || null })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Passport lookup failed. Try again.'); }
    finally { setBusy(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const application = { positionId: form.positionId, sourceType: form.sourceType, referralPartnerId: form.referralPartnerId || null };
      if (lookup?.found && lookup.candidateId) {
        const res = await postJson<any>('/intake/application', { candidateId: lookup.candidateId, ...application });
        navigate(`/applications/${res.data.applicationId}`); return;
      }
      if (form.dateOfBirth) {
        const result = await postJson<{ data: { matches: Duplicate[] } }>('/intake/duplicate-check', { fullName: form.fullName, dateOfBirth: form.dateOfBirth });
        if (result.data.matches.length) {
          setDuplicates(result.data.matches);
          setErr('Possible existing candidates match this name and date of birth. Review those records before creating another candidate.');
          return;
        }
      }
      const passport = passportNumber.trim() ? { passportNumber, issueDate: form.issueDate, expiryDate: form.expiryDate, issuingCountryId: form.issuingCountryId || null } : null;
      const candidate = { fullName: form.fullName, dateOfBirth: form.dateOfBirth || null, phone: form.phone, altPhone: form.altPhone || null, email: form.email || null, address: form.address || null };
      const res = await postJson<any>('/intake/applicant', { candidate, passport, application });
      navigate(`/applications/${res.data.applicationId}`);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not complete intake. Check the details and try again.'); }
    finally { setBusy(false); }
  }

  return <div>
    <PageHeader title="Intake" hint="Search by passport and issuing country, then create the candidate and application. Candidates without a passport are placed on hold." />
    {can('passport.lookup') && <form onSubmit={doLookup} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line p-4">
      <div className="w-full sm:w-64"><Field id="passport" label="Passport number" value={passportNumber} onChange={(e) => { setPassportNumber(e.target.value); setLookup(null); setDuplicates([]); }} /></div>
      <label className="w-full sm:w-64"><span className="title-4">Issuing country</span><select required value={form.issuingCountryId} onChange={(e) => { set('issuingCountryId', e.target.value); setLookup(null); }} className={control}><option value="">Select country</option>{(options?.countries ?? []).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
      <Button type="submit" disabled={busy || optionsLoading || !passportNumber.trim() || !form.issuingCountryId}>Lookup</Button>
      {lookup?.found && <p className="body-6">Found: {lookup.fullName} ({lookup.candidateCode}) · passport <StatusBadge value={lookup.passportStatus || 'UNKNOWN'} /> · open applications {lookup.openApplications ?? 0}</p>}
      {lookup && !lookup.found && <p className="body-6 text-muted">No passport match. You can create a new candidate below.</p>}
      {optionsError && <div className="w-full"><ErrorState message={optionsError} retry={reloadOptions} /></div>}
    </form>}

    {loading ? <SkeletonRows /> : error ? <ErrorState message={error} retry={reload} /> : <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line p-4">
      {!lookup?.found && <>
        <p className="title-4">Candidate</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fullName" label="Full name" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
          <Field id="dob" label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
          <Field id="phone" label="Phone" required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Field id="altPhone" label="Alt phone" value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} />
          <Field id="email" label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Field id="address" label="Address" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <p className="title-4">Passport (optional)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {!can('passport.lookup') && <Field id="new-passport" label="Passport number" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} />}
          <Field id="issueDate" label="Issue date" type="date" required={!!passportNumber.trim()} value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
          <Field id="expiryDate" label="Expiry date" type="date" required={!!passportNumber.trim()} value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
          {!can('passport.lookup') && <label className="title-4 flex flex-col gap-1">Issuing country<select required={!!passportNumber.trim()} value={form.issuingCountryId} onChange={(e) => set('issuingCountryId', e.target.value)} className={control}><option value="">Select country</option>{(options?.countries ?? []).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>}
        </div>
      </>}

      <p className="title-4">Application</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="title-4 flex flex-col gap-2">Position<select required value={form.positionId} onChange={(e) => set('positionId', e.target.value)} className={control}><option value="">Select an open position</option>{(positions ?? []).map((position) => <option key={position.id} value={position.id}>{position.label} · {position.employer} · {position.vacancies} vacancies · {position.currency} {position.agreedAmount}</option>)}</select></label>
        <label className="title-4 flex flex-col gap-2">Source type<select value={form.sourceType} onChange={(e) => set('sourceType', e.target.value)} className={control}>{['DIRECT', 'REFERRED', 'UNKNOWN'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {form.sourceType === 'REFERRED' && <label className="title-4 flex flex-col gap-2">Agent / broker *<select required value={form.referralPartnerId} onChange={(e) => set('referralPartnerId', e.target.value)} className={control}><option value="">Select agent / broker</option>{(options?.referralPartners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>}
      </div>
      {optionsError && <ErrorState message={optionsError} retry={reloadOptions} />}
      {positions?.length === 0 && <div className="body-6 text-muted">
        <p>No open position yet. A job title in Recruitment Setup is only a name — create a recruitment demand with a position and an approved price.</p>
        {blockedPositions?.length ? <ul className="mt-2 list-inside list-disc">{blockedPositions.map((p) => <li key={p.id}>{p.jobTitle?.title ?? 'Position'} — {p.blockers?.length ? p.blockers.join('; ') : 'Price setup needs review'}</li>)}</ul> : <p className="mt-1">No positions have been created yet.</p>}
      </div>}
      {duplicates.length > 0 && <div className="rounded-lg border border-line bg-surface p-3"><p className="title-4">Possible existing candidates</p><ul className="mt-2 list-inside list-disc body-6">{duplicates.map((candidate) => <li key={candidate.id}>{candidate.fullName} · {candidate.candidateCode}</li>)}</ul></div>}
      {err && <p role="alert" className="body-6 text-danger">{err}</p>}
      <div><Button type="submit" disabled={busy || optionsLoading || !positions?.length}>{busy ? 'Saving…' : lookup?.found ? 'Create application' : 'Create candidate & application'}</Button></div>
    </form>}
  </div>;
}
