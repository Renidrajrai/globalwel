import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ListPage } from '../components/engines';
import { Button } from '../components/Button';
import { EmptyState, Money, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';

function AccessDenied(): JSX.Element {
  return <EmptyState title="You do not have access to this page." hint="Ask an administrator if you need access." />;
}

function Tabs({ tabs, value, onChange, label }: { tabs: { key: string; label: string }[]; value: string; onChange: (key: string) => void; label: string }): JSX.Element {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2 border-b border-line pb-2">
      {tabs.map((tab) => (
        <Button
          key={tab.key}
          type="button"
          role="tab"
          size="sm"
          variant={value === tab.key ? 'primary' : 'ghost'}
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}

function TabPanel({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return <div role="tabpanel" aria-label={label} className="mt-4">{children}</div>;
}

const cx = {
  input: 'body-3 w-full rounded-lg border border-line bg-bg px-3 py-2 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
  btn: 'button-sm inline-flex items-center justify-center rounded-lg border border-line bg-bg px-2 py-1 text-fg hover:bg-surface disabled:pointer-events-none disabled:opacity-50',
  primary: 'button-md inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-on-primary hover:opacity-90 disabled:pointer-events-none disabled:opacity-50',
};
const post = (path: string, body: unknown = {}) => api(path, { method: 'POST', body });
const dateOf = (v: unknown) => (v ? String(v).slice(0, 10) : '');

type CatalogueOption = { id: string; name?: string; title?: string; legalName?: string; iso2Code?: string; iso3Code?: string; eligibility?: string; registeredCountry?: { name: string } };
type DemandPositionDraft = { cityId: string; jobTitleId: string; vacancies: string; salaryAmount: string; salaryCurrency: string; terms: string; priceAmount: string; priceCurrency: string };
const emptyDemandPosition = (): DemandPositionDraft => ({ cityId: '', jobTitleId: '', vacancies: '1', salaryAmount: '', salaryCurrency: 'USD', terms: '', priceAmount: '', priceCurrency: 'NPR' });

function DemandWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }): JSX.Element {
  const [step, setStep] = useState(0);
  const [employers, setEmployers] = useState<CatalogueOption[]>([]);
  const [countries, setCountries] = useState<CatalogueOption[]>([]);
  const [cities, setCities] = useState<CatalogueOption[]>([]);
  const [titles, setTitles] = useState<CatalogueOption[]>([]);
  const [employerId, setEmployerId] = useState(''); const [countryId, setCountryId] = useState('');
  const [reference, setReference] = useState(''); const [feims, setFeims] = useState(''); const [expiresOn, setExpiresOn] = useState('');
  const [positions, setPositions] = useState<DemandPositionDraft[]>([emptyDemandPosition()]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      api<any>('/resource/employers?page=1&pageSize=200&active=true'), api<any>('/resource/countries?page=1&pageSize=200&active=true'),
      api<any>('/resource/cities?page=1&pageSize=200&active=true'), api<any>('/resource/job-titles?page=1&pageSize=200&active=true'),
    ]).then(([e, c, city, title]) => { setEmployers(e.data); setCountries(c.data); setCities(city.data); setTitles(title.data); })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load catalogue records. Try again.'))
      .finally(() => setLoading(false));
  }, []);
  const country = countries.find((row) => row.id === countryId);
  const availableCities = cities.filter((row) => (row as any).countryId === countryId);
  const headings = ['Select employer', 'Choose destination', 'Demand details', 'Positions and pricing'];
  const updatePosition = (index: number, patch: Partial<DemandPositionDraft>) => setPositions((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const valid = step === 0 ? !!employerId : step === 1 ? !!countryId : step === 2 ? reference.trim().length >= 2 : positions.every((p) => p.cityId && p.jobTitleId && Number(p.vacancies) > 0 && p.priceAmount !== '' && p.priceCurrency.length === 3);
  async function submit() {
    setBusy(true); setError('');
    try {
      await post('/catalogue/demands/with-positions', {
        employerId, destinationCountryId: countryId, reference, feimsReference: feims || null, expiresOn: expiresOn || null,
        positions: positions.map((p) => ({ ...p, vacancies: Number(p.vacancies), salaryAmount: p.salaryAmount === '' ? null : Number(p.salaryAmount), priceAmount: Number(p.priceAmount) })),
      });
      onCreated(`Recruitment demand and ${positions.length} ${positions.length === 1 ? 'position' : 'positions'} saved. Price versions are drafts and need approval before they take effect.`);
    } catch (err) { const e = err as ApiError; setError(e.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Create Recruitment Demand" onClose={onClose}>
    <div className="mt-3 flex items-center gap-2" aria-label={`Step ${step + 1} of ${headings.length}`}>
      {headings.map((heading, i) => <div key={heading} className={`h-1.5 flex-1 rounded ${i <= step ? 'bg-primary' : 'bg-surface'}`} />)}
      <span className="caption-5 whitespace-nowrap">{step + 1} of {headings.length}</span>
    </div>
    <h3 className="title-2 mt-5">{headings[step]}</h3>
    <p className="body-6 mt-1 text-muted">{step === 0 ? 'Choose the employer. Its registration country is separate from the recruitment destination.' : step === 1 ? 'Choose the destination. Country registration does not change recruitment eligibility.' : step === 2 ? 'Add the demand reference and any useful government reference.' : 'Add one or more positions. Cities are restricted to the selected destination; new price versions are created as drafts.'}</p>
    {loading ? <div className="py-8"><SkeletonRows rows={3} /></div> : <div className="mt-4 max-h-[55vh] overflow-y-auto">
      {step === 0 && <label className="flex flex-col gap-1"><span className="title-4">Employer *</span><select className={cx.input} value={employerId} onChange={(e) => setEmployerId(e.target.value)}><option value="">Select employer</option>{employers.map((r) => <option key={r.id} value={r.id}>{r.legalName} · registered in {r.registeredCountry?.name ?? 'country not set'}</option>)}</select>{!employers.length && <p className="body-6 mt-2 text-muted">No active employers. Add one in Recruitment Setup first.</p>}</label>}
      {step === 1 && <label className="flex flex-col gap-1"><span className="title-4">Destination country *</span><select className={cx.input} value={countryId} onChange={(e) => { setCountryId(e.target.value); setPositions((rows) => rows.map((p) => ({ ...p, cityId: '' }))); }}><option value="">Select destination</option>{countries.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.eligibility?.replaceAll('_', ' ') ?? 'NOT REVIEWED'}</option>)}</select>{country && <div className="mt-3 rounded-lg border border-line p-3"><span className="title-4">Recruitment eligibility: </span><StatusBadge value={country.eligibility ?? 'NOT_REVIEWED'} /><p className="body-6 mt-2 text-muted">A separate authorised eligibility setting determines whether applications can be accepted.</p></div>}</label>}
      {step === 2 && <div className="flex flex-col gap-3"><label className="flex flex-col gap-1"><span className="title-4">Demand reference *</span><input className={cx.input} value={reference} onChange={(e) => setReference(e.target.value)} /></label><label className="flex flex-col gap-1"><span className="title-4">Government reference (optional)</span><input className={cx.input} value={feims} onChange={(e) => setFeims(e.target.value)} /></label><label className="flex flex-col gap-1"><span className="title-4">Expiry date (optional)</span><input type="date" className={cx.input} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></label></div>}
      {step === 3 && <div className="flex flex-col gap-4">{positions.map((p, index) => <fieldset key={index} className="rounded-lg border border-line p-3"><legend className="title-4 px-1">Position {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="caption-4">City *</span><select className={cx.input} value={p.cityId} onChange={(e) => updatePosition(index, { cityId: e.target.value })}><option value="">Select city</option>{availableCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="caption-4">Job title *</span><select className={cx.input} value={p.jobTitleId} onChange={(e) => updatePosition(index, { jobTitleId: e.target.value })}><option value="">Select title</option>{titles.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="caption-4">Vacancies *</span><input type="number" min="1" className={cx.input} value={p.vacancies} onChange={(e) => updatePosition(index, { vacancies: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="caption-4">Salary amount</span><input type="number" min="0" className={cx.input} value={p.salaryAmount} onChange={(e) => updatePosition(index, { salaryAmount: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="caption-4">Salary currency</span><input maxLength={3} className={cx.input} value={p.salaryCurrency} onChange={(e) => updatePosition(index, { salaryCurrency: e.target.value.toUpperCase() })} /></label>
        <label className="flex flex-col gap-1"><span className="caption-4">Candidate price *</span><input type="number" min="0" className={cx.input} value={p.priceAmount} onChange={(e) => updatePosition(index, { priceAmount: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="caption-4">Price currency *</span><input maxLength={3} className={cx.input} value={p.priceCurrency} onChange={(e) => updatePosition(index, { priceCurrency: e.target.value.toUpperCase() })} /></label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className="caption-4">Conditions</span><textarea className={cx.input} value={p.terms} onChange={(e) => updatePosition(index, { terms: e.target.value })} /></label>
        {!availableCities.length && <p className="body-6 text-muted sm:col-span-2">No cities exist for this destination. Add a city under Recruitment Setup first.</p>}
      </div>{positions.length > 1 && <button type="button" className={`${cx.btn} mt-3`} onClick={() => setPositions((rows) => rows.filter((_, i) => i !== index))}>Remove position</button>}</fieldset>)}
        <button type="button" className={cx.btn} onClick={() => setPositions((rows) => [...rows, emptyDemandPosition()])}>+ Add another position</button>
      </div>}
    </div>}
    {error && <p role="alert" className="body-6 mt-3 text-danger">{error}</p>}
    <div className="mt-5 flex justify-between gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => step ? setStep(step - 1) : onClose()}>{step ? 'Back' : 'Cancel'}</Button>
      {step < headings.length - 1 ? <button type="button" className={cx.primary} disabled={loading || !valid} onClick={() => setStep(step + 1)}>Continue</button> : <button type="button" className={cx.primary} disabled={busy || loading || !valid} onClick={submit}>{busy ? 'Saving…' : 'Create recruitment demand'}</button>}</div>
  </Modal>;
}

type MasterCity = { name: string; region: string };
type MasterTitle = { title: string; description: string };
function MasterDataWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }): JSX.Element {
  const [step, setStep] = useState(0); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [codeError, setCodeError] = useState(''); const [codeTouched, setCodeTouched] = useState(false);
  const [countries, setCountries] = useState<CatalogueOption[]>([]); const [existingCountryId, setExistingCountryId] = useState('');
  const [iso3Code, setIso3Code] = useState(''); const [countryName, setCountryName] = useState('');
  const [cities, setCities] = useState<MasterCity[]>([]); const [titles, setTitles] = useState<MasterTitle[]>([]);
  const [addEmployer, setAddEmployer] = useState(false); const [legalName, setLegalName] = useState(''); const [registeredCountryId, setRegisteredCountryId] = useState('');
  const [reference, setReference] = useState(''); const [contactName, setContactName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  useEffect(() => { api<any>('/resource/countries?page=1&pageSize=200&active=true').then((r) => setCountries(r.data)).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load countries. Try again.')).finally(() => setLoading(false)); }, []);
  const steps = ['Country', 'Cities', 'Job titles', 'Employer'];
  const valid = step === 0 ? (existingCountryId ? true : /^[A-Z]{3}$/.test(iso3Code) && countryName.trim().length >= 2)
    : step === 1 ? cities.every((c) => !c.name.trim() || c.name.trim().length >= 2)
      : step === 2 ? titles.every((t) => !t.title.trim() || t.title.trim().length >= 2)
        : !addEmployer || legalName.trim().length >= 2;
  async function submit() {
    setBusy(true); setError('');
    try {
      const result = await post('/catalogue/master-data/setup', {
        countryId: existingCountryId || null, iso3Code: existingCountryId ? null : iso3Code,
        countryName: existingCountryId ? null : countryName, cities: cities.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), region: c.region.trim() || null })),
        jobTitles: titles.filter((t) => t.title.trim()).map((t) => ({ title: t.title.trim(), description: t.description.trim() || null })),
        employer: addEmployer ? { legalName, registeredCountryId: registeredCountryId || existingCountryId || null, reference, contactName, email, phone } : null,
      }) as { data: { eligibility: string; cities: number; jobTitles: number; employerId: string | null } };
      const countryLabel = existingCountryId ? countries.find((c) => c.id === existingCountryId)?.name : countryName;
      onCreated(`${countryLabel} recruitment setup saved. Added ${result.data.cities} ${result.data.cities === 1 ? 'city' : 'cities'}, ${result.data.jobTitles} job titles${result.data.employerId ? ', and 1 employer' : ''}. Recruitment eligibility has not changed.`);
    } catch (e) {
      if (e instanceof ApiError && e.fields?.iso3Code) { setStep(0); setCodeError(e.fields.iso3Code); setError(''); }
      else setError(e instanceof ApiError ? e.message : 'Could not save this setup. Review the details and try again.');
    }
    finally { setBusy(false); }
  }
  return <Modal title="Add a country" onClose={onClose} roomy>
    <div className="mt-3 flex items-center gap-2" aria-label={`Step ${step + 1} of ${steps.length}`}>
      {steps.map((title, i) => <div key={title} className={`h-1.5 flex-1 rounded ${i <= step ? 'bg-primary' : 'bg-surface'}`} />)}<span className="caption-5 whitespace-nowrap">{step + 1} of {steps.length}</span>
    </div>
    <h3 className="title-2 mt-5">{steps[step]}</h3>
    <p className="body-6 mt-1 text-muted">{step === 0 ? 'Start with a new or existing country. Adding it does not approve it for recruitment.' : step === 1 ? 'Add the cities that belong to this country. You can add more than one.' : step === 2 ? 'Add reusable job titles for positions under this destination.' : 'Optionally register an employer now. Its registration country stays separate from the demand destination.'}</p>
    {loading ? <div className="py-8"><SkeletonRows rows={2} /></div> : <div className="mt-4 max-h-[55vh] overflow-y-auto">
      {step === 0 && <div className="flex flex-col gap-4"><label className="flex flex-col gap-2"><span className="title-3">Use an existing country</span><select className={`${cx.input} min-h-11`} value={existingCountryId} onChange={(e) => setExistingCountryId(e.target.value)}><option value="">Add a new country</option>{countries.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.iso3Code ?? c.iso2Code})</option>)}</select></label>{!existingCountryId && <div className="grid gap-4 sm:grid-cols-[12rem_1fr]"><label className="flex flex-col gap-2"><span className="title-3">Country Code (3 letters) *</span><input className={`${cx.input} min-h-11`} maxLength={3} value={iso3Code} onBlur={() => setCodeTouched(true)} onChange={(e) => { setIso3Code(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')); setCodeError(''); }} placeholder="e.g. NPL" aria-describedby="country-code-help country-code-error" /><span id="country-code-help" className="caption-4 text-muted">Use the ISO 3166-1 Alpha-3 country code.</span>{(codeError || (codeTouched && iso3Code.length > 0 && !/^[A-Z]{3}$/.test(iso3Code))) && <span id="country-code-error" className="caption-4 text-danger">{codeError || 'Enter exactly 3 letters.'}</span>}</label><label className="flex flex-col gap-2"><span className="title-3">Country name *</span><input className={`${cx.input} min-h-11`} value={countryName} onChange={(e) => setCountryName(e.target.value)} /></label></div>}</div>}
      {step === 1 && <div className="flex flex-col gap-3">{cities.map((city, i) => <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"><label className="flex flex-col gap-1"><span className="title-4">City</span><input className={cx.input} value={city.name} onChange={(e) => setCities((rows) => rows.map((r, n) => n === i ? { ...r, name: e.target.value } : r))} placeholder="City name" /></label><label className="flex flex-col gap-1"><span className="title-4">Region (optional)</span><input className={cx.input} value={city.region} onChange={(e) => setCities((rows) => rows.map((r, n) => n === i ? { ...r, region: e.target.value } : r))} /></label><button type="button" className={cx.btn} onClick={() => setCities((rows) => rows.filter((_, n) => n !== i))}>Remove</button></div>)}<button type="button" className={cx.btn} onClick={() => setCities((rows) => [...rows, { name: '', region: '' }])}>+ Add city</button><p className="caption-5 text-muted">Cities are saved under this country and cannot be assigned to a different destination.</p></div>}
      {step === 2 && <div className="flex flex-col gap-3">{titles.map((title, i) => <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"><label className="flex flex-col gap-1"><span className="title-4">Job title</span><input className={cx.input} value={title.title} onChange={(e) => setTitles((rows) => rows.map((r, n) => n === i ? { ...r, title: e.target.value } : r))} placeholder="e.g. Electrician" /></label><label className="flex flex-col gap-1"><span className="title-4">Description</span><input className={cx.input} value={title.description} onChange={(e) => setTitles((rows) => rows.map((r, n) => n === i ? { ...r, description: e.target.value } : r))} /></label><button type="button" className={cx.btn} onClick={() => setTitles((rows) => rows.filter((_, n) => n !== i))}>Remove</button></div>)}<button type="button" className={cx.btn} onClick={() => setTitles((rows) => [...rows, { title: '', description: '' }])}>+ Add job title</button><p className="caption-5 text-muted">Job titles are reusable across countries and demands.</p></div>}
      {step === 3 && <div className="flex flex-col gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={addEmployer} onChange={(e) => setAddEmployer(e.target.checked)} /> <span className="title-4">Register an employer now</span></label>{addEmployer && <div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 sm:col-span-2"><span className="title-4">Legal name *</span><input className={cx.input} value={legalName} onChange={(e) => setLegalName(e.target.value)} /></label><label className="flex flex-col gap-1 sm:col-span-2"><span className="title-4">Registered country</span><select className={cx.input} value={registeredCountryId || existingCountryId} onChange={(e) => setRegisteredCountryId(e.target.value)}><option value={existingCountryId}>{existingCountryId ? countries.find((c) => c.id === existingCountryId)?.name : countryName}</option>{countries.filter((c) => c.id !== existingCountryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="caption-5 text-muted">This is the company’s registration country, not necessarily the destination country.</span></label><label className="flex flex-col gap-1"><span className="title-4">Employer reference</span><input className={cx.input} value={reference} onChange={(e) => setReference(e.target.value)} /></label><label className="flex flex-col gap-1"><span className="title-4">Contact name</span><input className={cx.input} value={contactName} onChange={(e) => setContactName(e.target.value)} /></label><label className="flex flex-col gap-1"><span className="title-4">Email</span><input type="email" className={cx.input} value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="flex flex-col gap-1"><span className="title-4">Phone</span><input className={cx.input} value={phone} onChange={(e) => setPhone(e.target.value)} /></label></div>}</div>}
    </div>}
    {error && <p role="alert" className="body-6 mt-3 text-danger">{error}</p>}
    <div className="mt-5 flex justify-between gap-2"><Button variant="secondary" size="sm" onClick={() => step ? setStep(step - 1) : onClose()}>{step ? 'Back' : 'Cancel'}</Button>{step < steps.length - 1 ? <Button size="sm" disabled={loading || !valid} onClick={() => setStep(step + 1)}>Continue</Button> : <Button size="sm" disabled={loading || busy || !valid} onClick={submit}>{busy ? 'Saving...' : 'Save setup'}</Button>}</div>
  </Modal>;
}

type FieldSpec = {
  name: string; label: string; type?: 'text' | 'textarea' | 'select' | 'date';
  options?: { value: string; label: string }[]; required?: boolean; help?: string;
};

function Modal({ title, onClose, children, roomy = false }: { title: string; onClose: () => void; children: ReactNode; roomy?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className={`rise max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-bg ${roomy ? 'max-w-[38.4rem] p-7 sm:p-8' : 'max-w-lg p-6'}`}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="heading-6">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition-colors duration-300 ease-weighted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormModal(p: {
  title: string; message?: string; fields: FieldSpec[]; initial?: Record<string, string>;
  submitLabel?: string; onSubmit: (v: Record<string, string>) => Promise<unknown>; onClose: (saved?: boolean) => void;
}) {
  const [v, setV] = useState<Record<string, string>>(p.initial ?? {});
  const [err, setErr] = useState('');
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(''); setFe({});
    try { await p.onSubmit(v); p.onClose(true); }
    catch (e) { const x = e as ApiError; setErr(x.message); setFe(x.fields ?? {}); }
    finally { setBusy(false); }
  }
  const missing = p.fields.some((f) => f.required && !(v[f.name] ?? '').trim());
  return (
    <Modal title={p.title} onClose={() => p.onClose(false)}>
      {p.message && <p className="body-6 mt-2 text-muted">{p.message}</p>}
      {err && <p role="alert" className="body-6 mt-2 text-danger">{err}</p>}
      <div className="mt-4 flex flex-col gap-4">
        {p.fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1">
            <label htmlFor={`fm-${f.name}`} className="title-4">{f.label}{f.required && ' *'}</label>
            {f.type === 'textarea' ? (
              <textarea id={`fm-${f.name}`} className={cx.input} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            ) : f.type === 'select' ? (
              <select id={`fm-${f.name}`} className={cx.input} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                <option value="">Select…</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input id={`fm-${f.name}`} type={f.type ?? 'text'} className={cx.input} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            )}
            {f.help && <p className="caption-5 text-muted">{f.help}</p>}
            {fe[f.name] && <p className="caption-5 text-danger">{fe[f.name]}</p>}
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => p.onClose(false)}>Cancel</Button>
        <button type="button" className={cx.primary} disabled={busy || missing} onClick={go}>{busy ? 'Saving...' : p.submitLabel ?? 'Confirm'}</button>
      </div>
    </Modal>
  );
}

type Item = {
  label: string; show: boolean; title?: string; message?: string; confirm?: string;
  fields?: FieldSpec[]; initial?: Record<string, string>; run: (v: Record<string, string>) => Promise<unknown>;
};
function RowActions({ items, onDone }: { items: Item[]; onDone: () => void }) {
  const [open, setOpen] = useState<Item | null>(null);
  const visible = items.filter((i) => i.show);
  if (!visible.length) return <span className="caption-5 text-muted">None</span>;
  return (
    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
      {visible.map((i) => <button key={i.label} type="button" className={cx.btn} onClick={() => { if (i.confirm && !window.confirm(i.confirm)) return; setOpen(i); }}>{i.label}</button>)}
      {open && (
        <FormModal title={open.title ?? open.label} message={open.message} fields={open.fields ?? []} initial={open.initial}
          onSubmit={open.run} onClose={(saved) => { setOpen(null); if (saved) onDone(); }} />
      )}
    </div>
  );
}

const reasonField: FieldSpec = { name: 'reason', label: 'Reason', type: 'textarea', required: true };
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

const submitItem = (kind: string, r: any, can: boolean): Item => ({
  label: 'Submit for approval', title: 'Submit for approval',
  message: 'The CEO will be asked to approve this. You cannot edit it while it is pending.',
  show: can && ['DRAFT', 'REJECTED'].includes(r.approvalStatus),
  run: () => post(`/catalogue/submit/${kind}/${r.id}`),
});
const decideItems = (kind: string, r: any, can: boolean): Item[] =>
  (['APPROVED', 'REJECTED'] as const).map((d) => ({
    label: d === 'APPROVED' ? 'Approve' : 'Reject', title: d === 'APPROVED' ? 'Approve' : 'Reject',
    show: can && r.approvalStatus === 'PENDING_APPROVAL', fields: [reasonField],
    run: (v) => post(`/catalogue/decide/${kind}/${r.id}`, { decision: d, reason: v.reason }),
  }));
const activeItem = (resource: string, r: any, can: boolean): Item => ({
  label: r.active ? 'Deactivate' : 'Activate', show: can,
  confirm: r.active ? `Deactivate this ${resource.replaceAll('-', ' ').replace(/s$/, '')}? Existing records and applications will remain available for review.` : undefined,
  message: r.active ? 'Inactive records are hidden from new work. Existing applications are not affected.' : undefined,
  run: () => api(`/resource/${resource}/${r.id}`, { method: 'PATCH', body: { active: !r.active } }),
});
const editItem = (resource: string, r: any, fields: FieldSpec[], can: boolean): Item => ({
  label: 'Edit', title: `Edit ${resource.replaceAll('-', ' ')}`, show: can, fields,
  initial: Object.fromEntries(fields.map((field) => [field.name, dateOf(r[field.name]) || String(r[field.name] ?? '')])),
  run: (values) => api(`/resource/${resource}/${r.id}`, { method: 'PATCH', body: values }),
});
const verifyItem = (kind: string, r: any, can: boolean): Item => ({
  label: 'Set verification', show: can, fields: [
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['UNVERIFIED', 'VERIFIED', 'REJECTED'].map((x) => ({ value: x, label: x })) },
  ],
  initial: { status: r.verificationStatus },
  run: (v) => post(`/catalogue/${kind}/${r.id}/verification`, { status: v.status }),
});

type Meta = { payerTypes: string[]; candidatePayer: string; eligibilityStatuses: string[] };
type Comp = { componentType: string; payer: string; amount: string };

function PriceVersionModal({ row, positionId: initialPositionId, meta, onClose }: { row?: any; positionId?: string; meta: Meta; onClose: (saved?: boolean) => void }) {
  const editing = !!row;
  const [positions, setPositions] = useState<any[]>([]);
  const [positionId, setPositionId] = useState(row?.positionId ?? initialPositionId ?? '');
  const [currency, setCurrency] = useState(row?.currency ?? 'NPR');
  const [from, setFrom] = useState(dateOf(row?.effectiveFrom));
  const [to, setTo] = useState(dateOf(row?.effectiveTo));
  const [reason, setReason] = useState(row?.changeReason ?? '');
  const [ref, setRef] = useState(row?.complianceReference ?? '');
  const [comps, setComps] = useState<Comp[]>(
    row?.components?.length
      ? row.components.map((c: any) => ({ componentType: c.componentType, payer: c.payer, amount: String(c.amount) }))
      : [{ componentType: '', payer: meta.candidatePayer, amount: '' }]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);

  useEffect(() => { if (!editing) api<any>('/resource/positions?page=1&pageSize=200').then((r) => setPositions(r.data ?? [])); }, [editing]);

  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? 0 : Number(s));
  const candidatePays = comps.filter((c) => c.payer === meta.candidatePayer).reduce((s, c) => s + num(c.amount), 0);
  const packageTotal = comps.reduce((s, c) => s + num(c.amount), 0);
  const setComp = (i: number, patch: Partial<Comp>) => setComps(comps.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  async function save() {
    setBusy(true); setErr(''); setFe({});
    const body = {
      ...(editing ? {} : { positionId }), currency, effectiveFrom: from, effectiveTo: to || null,
      changeReason: reason, complianceReference: ref || null,
      components: comps.map((c) => ({ componentType: c.componentType, payer: c.payer, amount: num(c.amount) })),
    };
    try {
      if (editing) await api(`/catalogue/price-versions/${row.id}`, { method: 'PUT', body });
      else await post('/catalogue/price-versions', body);
      onClose(true);
    } catch (e) { const x = e as ApiError; setErr(x.message); setFe(x.fields ?? {}); } finally { setBusy(false); }
  }
  const invalid = (!editing && !positionId) || !from || reason.trim().length < 3 || comps.some((c) => !c.componentType.trim());

  return (
    <Modal title={editing ? 'Edit price draft' : 'Create price version'} onClose={() => onClose(false)}>
      {err && <p role="alert" className="body-6 mt-2 text-danger">{err}</p>}
      <div className="mt-4 flex flex-col gap-4">
        {!editing && !initialPositionId && (
          <div className="flex flex-col gap-1">
            <label htmlFor="pv-position" className="title-4">Position *</label>
            <select id="pv-position" className={cx.input} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
              <option value="">Select…</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.jobTitle?.title} - {p.city?.name} ({p.demand?.destinationCountry?.name})</option>)}
            </select>
            {fe.positionId && <p className="caption-5 text-danger">{fe.positionId}</p>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="pv-currency" className="title-4">Currency *</label>
            <input id="pv-currency" className={cx.input} value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            {fe.currency && <p className="caption-5 text-danger">{fe.currency}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pv-from" className="title-4">Effective from *</label>
            <input id="pv-from" type="date" className={cx.input} value={from} onChange={(e) => setFrom(e.target.value)} />
            {fe.effectiveFrom && <p className="caption-5 text-danger">{fe.effectiveFrom}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pv-to" className="title-4">Effective to</label>
            <input id="pv-to" type="date" className={cx.input} value={to} onChange={(e) => setTo(e.target.value)} />
            {fe.effectiveTo && <p className="caption-5 text-danger">{fe.effectiveTo}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="title-4">Price components *</div>
          {comps.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_7rem_auto]">
              <input className={cx.input} placeholder="Name (e.g. Service charge)" value={c.componentType} onChange={(e) => setComp(i, { componentType: e.target.value })} />
              <select className={cx.input} value={c.payer} onChange={(e) => setComp(i, { payer: e.target.value })}>
                {meta.payerTypes.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input className={cx.input} inputMode="decimal" placeholder="Amount" value={c.amount} onChange={(e) => setComp(i, { amount: e.target.value })} />
              <button type="button" className={cx.btn} disabled={comps.length === 1} onClick={() => setComps(comps.filter((_, k) => k !== i))} aria-label="Remove">×</button>
            </div>
          ))}
          <button type="button" className={cx.btn} onClick={() => setComps([...comps, { componentType: '', payer: meta.candidatePayer, amount: '' }])}>+ Add component</button>
          {fe.components && <p className="caption-5 text-danger">{fe.components}</p>}
          <div className="rounded-lg border border-line bg-surface p-2 body-6">
            Candidate pays <b>{currency} {candidatePays.toFixed(2)}</b> · Package total <b>{currency} {packageTotal.toFixed(2)}</b>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pv-reason" className="title-4">Reason for this price *</label>
          <textarea id="pv-reason" className={cx.input} value={reason} onChange={(e) => setReason(e.target.value)} />
          {fe.changeReason && <p className="caption-5 text-danger">{fe.changeReason}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pv-ref" className="title-4">Compliance reference</label>
          <input id="pv-ref" className={cx.input} value={ref} onChange={(e) => setRef(e.target.value)} />
          <p className="caption-5 text-muted">Required before this can be submitted for approval.</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onClose(false)}>Cancel</Button>
        <button type="button" className={cx.primary} disabled={busy || invalid} onClick={save}>{busy ? 'Saving...' : 'Save draft'}</button>
      </div>
    </Modal>
  );
}

export function CataloguePage(): JSX.Element {
  const { can } = useAuth();
  const [tab, setTab] = useState('countries');
  const [v, setV] = useState(0);
  const bump = () => setV((n) => n + 1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pvModal, setPvModal] = useState<{ row?: any; positionId?: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [masterWizardOpen, setMasterWizardOpen] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { api<{ data: Meta }>('/catalogue/meta').then((r) => setMeta(r.data)).catch(() => setMeta(null)); }, []);

  if (!can('catalogue.read', 'catalogue.manage')) return <AccessDenied />;
  const manage = can('catalogue.manage');
  const approve = can('catalogue.approve');
  const manageEligibility = can('catalogue.eligibility.manage');

  const tabs = [
    { key: 'countries', label: 'Countries' }, { key: 'cities', label: 'Cities' }, { key: 'job-titles', label: 'Job titles' },
    { key: 'employers', label: 'Employers' }, { key: 'partners', label: 'Agents / brokers' },
    { key: 'demands', label: 'Recruitment demands' }, { key: 'positions', label: 'Positions & prices' },
  ];
  const group = tab === 'partners' ? 'partners' : ['demands', 'positions'].includes(tab) ? 'setup' : 'master';
  const actions = (items: (r: any) => Item[]) => ({ header: 'Actions', cell: (r: any) => <RowActions items={items(r)} onDone={bump} /> });
  const priceVersionsPanel = meta ? <section className="mt-10" aria-labelledby="price-versions-heading">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 id="price-versions-heading" className="title-2">Position prices</h2><p className="body-6 mt-1 text-muted">Edit draft or rejected versions. For an approved price increase, create a new version; existing application price snapshots stay unchanged.</p></div>{manage && <button type="button" className={cx.primary} onClick={() => setPvModal({})}>New price version</button>}</div>
    <ListPage key={`prices-${v}`} cfg={{
      title: 'Position prices', resource: 'price-versions', embedded: true,
      columns: [
        { header: 'Position', cell: (r: any) => `${r.position?.jobTitle?.title ?? 'Position'} - ${r.position?.city?.name ?? ''}` },
        { header: 'Candidate pays', cell: (r: any) => <Money currency={r.currency} amount={String((r.components ?? []).filter((c: any) => c.payer === meta.candidatePayer).reduce((sum: number, c: any) => sum + Number(c.amount), 0))} /> },
        { header: 'Package total', cell: (r: any) => <Money currency={r.currency} amount={String((r.components ?? []).reduce((sum: number, c: any) => sum + Number(c.amount), 0))} /> },
        { header: 'From', cell: (r: any) => dateOf(r.effectiveFrom) }, { header: 'To', cell: (r: any) => dateOf(r.effectiveTo) || 'Open' },
        { header: 'Approval', cell: (r: any) => <StatusBadge value={r.approvalStatus} /> },
        actions((r) => [
          { label: 'Edit draft', show: manage && ['DRAFT', 'REJECTED'].includes(r.approvalStatus), run: async () => { setPvModal({ row: r }); } },
          submitItem('price-versions', r, manage), ...decideItems('price-versions', r, approve),
        ]),
      ], empty: { title: 'No position prices yet.', hint: 'Create a price version from a position above.' },
    }} />
  </section> : <SkeletonRows rows={3} />;

  return (
    <div>
      <PageHeader title="Catalogue" hint="Destinations, employers, demands, positions and prices. Staff can apply only to positions with an eligible destination and an approved current price." />
      {notice && <p role="status" className="body-6 mt-3 rounded-lg border border-line bg-surface p-3">{notice}</p>}
      <nav aria-label="Catalogue workspace" className="mt-5 flex flex-wrap gap-2 border-b border-line pb-3">
        <Button size="md" className="text-base font-semibold" variant={group === 'master' ? 'primary' : 'ghost'} onClick={() => setTab('countries')}>Recruitment Setup</Button>
        <Button size="md" className="text-base font-semibold" variant={group === 'setup' ? 'primary' : 'ghost'} onClick={() => setTab('demands')}>Recruitment Setup</Button>
        <Button size="md" className="text-base font-semibold" variant={group === 'partners' ? 'primary' : 'ghost'} onClick={() => setTab('partners')}>Agents / brokers</Button>
      </nav>
      {group === 'master' && <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><Tabs tabs={tabs.slice(0, 4)} value={tab} onChange={setTab} label="Recruitment Setup" />{manage && <Button onClick={() => { setNotice(''); setMasterWizardOpen(true); }}>Add a country</Button>}</div>}
      {group === 'setup' && <div className="mt-3"><Tabs tabs={tabs.slice(5, 7)} value={tab} onChange={setTab} label="Recruitment Setup" /></div>}
      <TabPanel label={tabs.find((t) => t.key === tab)?.label ?? ''}>

        {tab === 'countries' && (
          <ListPage key={v} cfg={{
            title: 'Countries', resource: 'countries', embedded: true,
            hint: 'Adding a country does not make it eligible for recruitment. Eligibility is managed separately by authorised staff.',
            columns: [
              { header: 'Code', cell: (r: any) => r.iso3Code ?? r.iso2Code },
              { header: 'Name', cell: (r: any) => r.name },
              { header: 'Eligibility', cell: (r: any) => <span title={`${r.eligibilitySource || 'No verification source recorded'}${r.eligibilityVerifiedAt ? ` · verified ${dateOf(r.eligibilityVerifiedAt)} by ${r.eligibilityVerifiedByName || 'unknown user'}` : ''}`}><StatusBadge value={r.eligibility} /></span> },
              { header: 'Active', cell: (r: any) => yesNo(r.active) },
              actions((r) => [
                { label: 'Set eligibility', show: manageEligibility, fields: [
                    { name: 'eligibility', label: 'Eligibility', type: 'select', required: true,
                      options: (meta?.eligibilityStatuses ?? []).map((x) => ({ value: x, label: x })) },
                    { name: 'source', label: 'Reference (optional)' }],
                  initial: { eligibility: r.eligibility },
                  run: (x) => post(`/catalogue/countries/${r.id}/eligibility`, { eligibility: x.eligibility, source: x.source }) },
                editItem('countries', r, [{ name: 'name', label: 'Country name', required: true }], manage),
                activeItem('countries', r, manage),
              ]),
            ],
            empty: { title: 'No countries yet.' },
          }} />
        )}

        {tab === 'cities' && (
          <ListPage key={v} cfg={{
            title: 'Cities', resource: 'cities', embedded: true,
            columns: [
              { header: 'City', cell: (r: any) => r.name },
              { header: 'Country', cell: (r: any) => r.country?.name || 'None' },
              { header: 'Region', cell: (r: any) => r.region || 'None' },
              { header: 'Active', cell: (r: any) => yesNo(r.active) },
              actions((r) => [editItem('cities', r, [{ name: 'name', label: 'City name', required: true }, { name: 'region', label: 'Region' }], manage), activeItem('cities', r, manage)]),
            ],
            empty: { title: 'No cities yet.' },
          }} />
        )}

        {tab === 'job-titles' && (
          <ListPage key={v} cfg={{
            title: 'Job titles', resource: 'job-titles', embedded: true,
            columns: [
              { header: 'Title', cell: (r: any) => r.title },
              { header: 'Description', cell: (r: any) => r.description || 'None' },
              { header: 'Active', cell: (r: any) => yesNo(r.active) },
              actions((r) => [editItem('job-titles', r, [{ name: 'title', label: 'Title', required: true }, { name: 'description', label: 'Description', type: 'textarea' }], manage), activeItem('job-titles', r, manage)]),
            ],
            empty: { title: 'No job titles yet.' },
          }} />
        )}

        {tab === 'employers' && (
          <ListPage key={v} cfg={{
            title: 'Employers', resource: 'employers', embedded: true,
            hint: 'Employer registration details and country. The recruitment destination is selected separately on a demand.',
            columns: [
              { header: 'Legal name', cell: (r: any) => r.legalName },
              { header: 'Country', cell: (r: any) => r.registeredCountry?.name || 'None' },
              { header: 'Contact', cell: (r: any) => r.contactName || 'None' },
              { header: 'Verification', cell: (r: any) => <StatusBadge value={r.verificationStatus} /> },
              { header: 'Active', cell: (r: any) => yesNo(r.active) },
              actions((r) => [editItem('employers', r, [{ name: 'legalName', label: 'Legal name', required: true }, { name: 'reference', label: 'Reference' }, { name: 'contactName', label: 'Contact name' }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' }], manage), verifyItem('employers', r, approve), activeItem('employers', r, manage)]),
            ],
            empty: { title: 'No employers yet.' },
          }} />
        )}

        {tab === 'demands' && (
          <>
          {manage && <div className="mb-3"><button type="button" className={cx.primary} onClick={() => { setNotice(''); setWizardOpen(true); }}>Create Recruitment Demand</button></div>}
          <ListPage key={v} cfg={{
            title: 'Recruitment demands', resource: 'demands', embedded: true,
            hint: 'A recruitment demand groups positions for one employer and destination country.',
            columns: [
              { header: 'Reference', cell: (r: any) => r.reference },
              { header: 'Employer', cell: (r: any) => r.employer?.legalName || 'None' },
              { header: 'Destination', cell: (r: any) => r.destinationCountry?.name || 'None' },
              { header: 'FEIMS ref.', cell: (r: any) => r.feimsReference || 'Missing' },
              { header: 'Expires', cell: (r: any) => dateOf(r.expiresOn) || 'None' },
              { header: 'Active', cell: (r: any) => yesNo(r.active) },
              actions((r) => [editItem('demands', r, [{ name: 'reference', label: 'Demand reference', required: true }, { name: 'feimsReference', label: 'Government reference' }, { name: 'expiresOn', label: 'Expiry date', type: 'date' }], manage), activeItem('demands', r, manage)]),
            ],
            empty: { title: 'No demands yet.' },
          }} />
          </>
        )}

        {tab === 'positions' && (
          <>
          <ListPage key={v} cfg={{
            title: 'Positions', resource: 'positions', embedded: true,
            hint: 'The Status column shows whether staff can apply to a position, and if not, why.',
            columns: [
              { header: 'Job title', cell: (r: any) => r.jobTitle?.title || 'None' },
              { header: 'City', cell: (r: any) => r.city?.name || 'None' },
              { header: 'Country', cell: (r: any) => r.demand?.destinationCountry?.name || 'None' },
              { header: 'Employer', cell: (r: any) => r.demand?.employer?.legalName || 'None' },
              { header: 'Recruitment demand', cell: (r: any) => r.demand?.reference || 'None' },
              { header: 'Vacancies', cell: (r: any) => r.vacancies },
              { header: 'Salary', cell: (r: any) => r.salaryAmount ? <Money amount={r.salaryAmount} currency={r.salaryCurrency || 'NPR'} /> : 'None' },
              { header: 'Status', cell: (r: any) => r.blockers?.length
                  ? <span className="caption-5 text-amber-700" title={r.blockers.join('\n')}>Not open: {r.blockers[0]}{r.blockers.length > 1 ? ` (+${r.blockers.length - 1})` : ''}</span>
                  : <span className="caption-5 text-green-700">Open for applicants</span> },
              actions((r) => [
                { label: 'New price version', show: manage, run: async () => { setPvModal({ positionId: r.id }); } },
                { label: 'Edit vacancies', show: manage, fields: [{ name: 'vacancies', label: 'Vacancies', required: true }], initial: { vacancies: String(r.vacancies) },
                  run: (x) => api(`/resource/positions/${r.id}`, { method: 'PATCH', body: { vacancies: Number(x.vacancies) } }) },
                activeItem('positions', r, manage),
              ]),
            ],
            primary: { label: 'New position', perm: ['catalogue.manage'], form: { title: 'New position', path: '/catalogue/positions', fields: [
              { name: 'demandId', label: 'Demand', required: true, optionsResource: { resource: 'demands', label: (r: any) => `${r.reference} - ${r.employer?.legalName ?? ''} (${r.destinationCountry?.name ?? ''})` } },
              { name: 'cityId', label: 'City (must be in the demand country)', required: true, optionsResource: { resource: 'cities', label: (r: any) => `${r.name} (${r.country?.name ?? ''})` } },
              { name: 'jobTitleId', label: 'Job title', required: true, optionsResource: { resource: 'job-titles', label: (r: any) => r.title } },
              { name: 'vacancies', label: 'Vacancies', type: 'number', required: true },
              { name: 'salaryAmount', label: 'Salary amount', type: 'number' },
              { name: 'salaryCurrency', label: 'Salary currency (e.g. EUR)' },
              { name: 'terms', label: 'Terms and conditions', type: 'textarea' },
            ] } },
            empty: { title: 'No positions yet.' },
          }} />
          {priceVersionsPanel}
          </>
        )}

        {tab === 'partners' && (
          <ListPage key={v} cfg={{
            title: 'Agents / partners', resource: 'referral-partners', embedded: true,
            columns: [
              { header: 'Name', cell: (r: any) => r.name },
              { header: 'Contact', cell: (r: any) => r.contact || 'None' },
              { header: 'Type', cell: (r: any) => r.partnerType || 'None' },
              { header: 'Verification', cell: (r: any) => <StatusBadge value={r.verificationStatus} /> },
              { header: 'Active', cell: (r: any) => yesNo(r.active) },
              actions((r) => [verifyItem('referral-partners', r, approve), activeItem('referral-partners', r, manage)]),
            ],
            primary: { label: 'New partner', perm: ['catalogue.manage'], form: { title: 'New partner', path: '/resource/referral-partners', fields: [
              { name: 'name', label: 'Name', required: true }, { name: 'contact', label: 'Contact' }, { name: 'partnerType', label: 'Type' },
            ] } },
            empty: { title: 'No partners yet.' },
          }} />
        )}

      </TabPanel>

      {pvModal && meta && <PriceVersionModal row={pvModal.row} positionId={pvModal.positionId} meta={meta} onClose={(saved) => { setPvModal(null); if (saved) bump(); }} />}
      {masterWizardOpen && <MasterDataWizard onClose={() => setMasterWizardOpen(false)} onCreated={(message) => { setMasterWizardOpen(false); setNotice(message); bump(); }} />}
      {wizardOpen && <DemandWizard onClose={() => setWizardOpen(false)} onCreated={(message) => { setWizardOpen(false); setNotice(message); bump(); }} />}
    </div>
  );
}
