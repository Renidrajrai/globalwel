import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';
import { ApiError } from '../lib/api';
import { postJson, useJson, useResource } from '../lib/useApi';

type Lookup = { found: boolean; candidateId?: string; fullName?: string; candidateCode?: string; passportStatus?: string; openApplications?: number; referId?: string | null; referName?: string | null };
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
  const [positionQuery, setPositionQuery] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '', dateOfBirth: '', phone: '', altPhone: '', email: '', address: '', referId: '',
    issueDate: '', expiryDate: '', issuingCountryId: '',
  });

  useEffect(() => {
    if (!form.issuingCountryId && options?.countries.length) {
      const nepal = options.countries.find((country) => country.iso2Code === 'NP');
      if (nepal) setForm((current) => ({ ...current, issuingCountryId: nepal.id }));
    }
  }, [form.issuingCountryId, options]);

  const set = (key: string, value: string) => {
    setDuplicates([]);
    setForm((current) => ({ ...current, [key]: value }));
  };

  if (!can('candidate.create') || !canCreateApplication) return <EmptyState title="Intake requires both candidate and application access." hint="Ask an administrator to assign the required permissions." />;

  async function doLookup(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true); setLookup(null);
    try { const { data: result } = await postJson<{ data: Lookup }>('/intake/passport-lookup', { passportNumber, issuingCountryId: form.issuingCountryId || null }); setLookup(result); setForm((current) => ({ ...current, referId: result.referId ?? '' })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Passport lookup failed. Try again.'); }
    finally { setBusy(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const referId = lookup?.found ? lookup.referId ?? null : form.referId || null;
      const application = { positionIds: selectedPositions, sourceType: referId ? 'REFERRED' : 'DIRECT', referralPartnerId: referId };
      if (lookup?.found && lookup.candidateId) {
        const res = await postJson<any>('/intake/applications', { candidateId: lookup.candidateId, ...application });
        navigate(`/applications/${res.data.applications[0].id}`); return;
      }
      if (form.dateOfBirth) {
        const result = await postJson<{ data: { matches: Duplicate[] } }>('/intake/duplicate-check', { fullName: form.fullName, dateOfBirth: form.dateOfBirth });
        if (result.data.matches.length) {
          setDuplicates(result.data.matches);
          setErr('Possible existing candidates match this name and date of birth. Review those records before creating another candidate.');
          return;
        }
      }
      const passport = passportNumber.trim() ? { passportNumber: passportNumber.trim().toUpperCase(), issueDate: form.issueDate, expiryDate: form.expiryDate, issuingCountryId: form.issuingCountryId || null } : null;
      const candidate = { fullName: form.fullName, dateOfBirth: form.dateOfBirth || null, phone: form.phone, altPhone: form.altPhone || null, email: form.email || null, address: form.address || null, referId: form.referId || null };
      const res = await postJson<any>('/intake/applicant', { candidate, passport, application });
      navigate(`/applications/${res.data.applications[0].id}`);
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
          <label className="title-4 flex flex-col gap-2">Refer (optional)<select value={form.referId} onChange={(e) => set('referId', e.target.value)} className={control}><option value="">Direct / no Refer</option>{(options?.referralPartners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
        </div>
        <p className="title-4">Passport (optional)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {!can('passport.lookup') && <Field id="new-passport" label="Passport number" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} />}
          <Field id="issueDate" label="Issue date" type="date" required={!!passportNumber.trim()} value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
          <Field id="expiryDate" label="Expiry date" type="date" required={!!passportNumber.trim()} value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
          {!can('passport.lookup') && <label className="title-4 flex flex-col gap-1">Issuing country<select required={!!passportNumber.trim()} value={form.issuingCountryId} onChange={(e) => set('issuingCountryId', e.target.value)} className={control}><option value="">Select country</option>{(options?.countries ?? []).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>}
        </div>
      </>}

      <p className="title-4">One application · {selectedPositions.length} position preferences</p>
      <Field id="position-search" label="Find an available position" type="search" placeholder="Search job, company, country or demand" value={positionQuery} onChange={(e) => setPositionQuery(e.target.value)} />
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-line p-2">
        {(positions ?? []).filter((position) => `${position.label} ${position.employer}`.toLowerCase().includes(positionQuery.trim().toLowerCase())).map((position) => <label key={position.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-surface"><input type="checkbox" className="mt-1" checked={selectedPositions.includes(position.id)} onChange={(e) => setSelectedPositions((ids) => e.target.checked ? [...ids, position.id] : ids.filter((id) => id !== position.id))} /><span><span className="title-4 block">{position.label}</span><span className="caption-5 text-muted">{position.employer} · {position.vacancies} vacancies remaining · {position.currency} {position.agreedAmount}</span></span></label>)}
        {!positions?.length && <p className="body-6 p-3 text-muted">No open positions with an available price and vacancies.</p>}
      </div>
      {selectedPositions.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Selected positions">{selectedPositions.map((id) => { const position = positions?.find((item) => item.id === id); return <button key={id} type="button" onClick={() => setSelectedPositions((ids) => ids.filter((selected) => selected !== id))} className="rounded-full border border-line px-3 py-1 caption-5">{position?.label} ×</button>; })}</div>}
      {lookup?.found && <p className="body-6">Refer: {lookup.referName || 'Direct / no Refer'}</p>}
      {optionsError && <ErrorState message={optionsError} retry={reloadOptions} />}
      {positions?.length === 0 && <div className="body-6 text-muted">
        <p>No open position yet. Add a recruitment demand with a position and an initial price before starting an application.</p>
        {blockedPositions?.length ? <ul className="mt-2 list-inside list-disc">{blockedPositions.map((p) => <li key={p.id}>{p.jobTitle?.title ?? 'Position'} — {p.blockers?.length ? p.blockers.join('; ') : 'Price setup needs review'}</li>)}</ul> : <p className="mt-1">No positions have been created yet.</p>}
      </div>}
      {duplicates.length > 0 && <div className="rounded-lg border border-line bg-surface p-3"><p className="title-4">Possible existing candidates</p><ul className="mt-2 list-inside list-disc body-6">{duplicates.map((candidate) => <li key={candidate.id}>{candidate.fullName} · {candidate.candidateCode}</li>)}</ul></div>}
      {err && <p role="alert" className="body-6 text-danger">{err}</p>}
      <div><Button type="submit" disabled={busy || optionsLoading || !selectedPositions.length}>{busy ? 'Saving…' : lookup?.found ? 'Create one application' : 'Create applicant & application'}</Button></div>
    </form>}
  </div>;
}
