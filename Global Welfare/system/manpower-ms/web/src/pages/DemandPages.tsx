import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ListPage } from '../components/engines';
import { EmptyState, ErrorState, FormDialog, Money, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dateInputValue, displayDate } from '../lib/dates';
import { useOne, useResource } from '../lib/useApi';
import { PriceVersionModal, type Meta } from './PriceVersionModal';

type DraftPosition = { jobTitleText: string; vacancies: string; salaryAmount: string; salaryCurrency: string; priceAmount: string; priceCurrency: string };
const emptyPosition = (): DraftPosition => ({ jobTitleText: '', vacancies: '1', salaryAmount: '', salaryCurrency: 'NPR', priceAmount: '', priceCurrency: 'NPR' });
const fieldClass = 'body-3 w-full rounded-lg border border-line bg-bg px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg';

function DemandCreate({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): JSX.Element {
  const countries = useResource<any>('countries', { active: true }, 1, 200);
  const agencies = useResource<any>('overseas-agencies', { active: true }, 1, 200);
  const employers = useResource<any>('employers', { active: true }, 1, 200);
  const titles = useResource<any>('job-titles', { active: true }, 1, 200);
  const [countryId, setCountryId] = useState(''); const [agencyId, setAgencyId] = useState(''); const [employerId, setEmployerId] = useState('');
  const [expiresOn, setExpiresOn] = useState(''); const [positions, setPositions] = useState<DraftPosition[]>([emptyPosition()]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const loading = countries.loading || agencies.loading || employers.loading || titles.loading;
  const availableTitles = titles.data;
  const compatibleEmployers = employers.data.filter((row) => {
    const hasDestinationRules = (row.destinationCountries ?? []).length > 0;
    const supportsCountry = !hasDestinationRules || row.destinationCountries.some((link: any) => link.countryId === countryId || link.country?.id === countryId);
    const agencyIds = (row.overseasAgencies ?? []).map((link: any) => link.overseasAgencyId ?? link.overseasAgency?.id);
    return supportsCountry && agencyIds.includes(agencyId);
  });
  const totalVacancies = positions.reduce((sum, row) => sum + (Number(row.vacancies) || 0), 0);
  const valid = !!countryId && !!agencyId && !!employerId && positions.length > 0 && positions.every((p) => p.jobTitleText.trim().length >= 2 && Number.isInteger(Number(p.vacancies)) && Number(p.vacancies) > 0 && p.priceAmount !== '' && /^[A-Z]{3}$/.test(p.priceCurrency) && Number(p.priceAmount) >= 0 && (p.salaryAmount === '' || Number(p.salaryAmount) >= 0));
  const setPosition = (index: number, value: Partial<DraftPosition>) => setPositions((items) => items.map((item, i) => i === index ? { ...item, ...value } : item));
  async function save() {
    setBusy(true); setError('');
    try {
      await api('/catalogue/demands/with-positions', { method: 'POST', body: {
        destinationCountryId: countryId, overseasAgencyId: agencyId, employerId, expiresOn: expiresOn || null,
        positions: positions.map((p) => { const normalized = p.jobTitleText.trim().replace(/\s+/g, ' ').toLowerCase(); const existing = availableTitles.find((title) => title.title.trim().replace(/\s+/g, ' ').toLowerCase() === normalized); return { ...(existing ? { jobTitleId: existing.id } : { newJobTitle: p.jobTitleText }), vacancies: Number(p.vacancies), salaryAmount: p.salaryAmount === '' ? null : Number(p.salaryAmount), salaryCurrency: p.salaryCurrency, terms: null, priceAmount: Number(p.priceAmount), priceCurrency: p.priceCurrency }; }),
      } });
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save this demand. Check the details and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Create demand" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-bg p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><h2 className="heading-6">Create demand</h2><p className="body-6 mt-1 text-muted">Choose the foreign opportunity, then add the positions and worker quantities.</p></div><Button variant="ghost" onClick={onClose}>Close</Button></div>
      {loading ? <div className="mt-5"><SkeletonRows rows={5} /></div> : <div className="mt-6 space-y-6">
        <section className="space-y-3"><h3 className="title-2">1. Destination country</h3><select className={fieldClass} value={countryId} onChange={(e) => { setCountryId(e.target.value); setEmployerId(''); }}><option value="">Select country</option>{countries.data.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></section>
        <section className="space-y-3"><h3 className="title-2">2. Overseas agency</h3><select className={fieldClass} value={agencyId} onChange={(e) => { setAgencyId(e.target.value); setEmployerId(''); }}><option value="">Select overseas agency</option>{agencies.data.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.country?.name}</option>)}</select></section>
        <section className="space-y-3"><h3 className="title-2">3. Company</h3><select className={fieldClass} value={employerId} disabled={!countryId || !agencyId} onChange={(e) => { setEmployerId(e.target.value); setPositions((items) => items.map((position) => ({ ...position, jobTitleId: '' }))); }}><option value="">Select company</option>{compatibleEmployers.map((row) => <option key={row.id} value={row.id}>{row.legalName}</option>)}</select>{!compatibleEmployers.length && countryId && agencyId && <p className="caption-5 text-muted">No linked companies match these choices. Add or link a company from the overseas agency page.</p>}</section>
        <section className="space-y-3"><div><h3 className="title-2">4. Job positions</h3><p className="caption-4 text-muted">Vacancies are the number of workers requested for each title.</p></div><datalist id="job-title-options">{availableTitles.map((item) => <option key={item.id} value={item.title} />)}</datalist>{positions.map((row, index) => { const match = availableTitles.some((item) => item.title.trim().replace(/\s+/g, ' ').toLowerCase() === row.jobTitleText.trim().replace(/\s+/g, ' ').toLowerCase()); return <fieldset key={index} className="rounded-xl border border-line p-4"><legend className="title-4 px-1">Position {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2"><label className="title-4 flex flex-col gap-1 sm:col-span-2">Job title<input className={fieldClass} list="job-title-options" value={row.jobTitleText} onChange={(e) => setPosition(index, { jobTitleText: e.target.value })} placeholder="Choose or enter a title" />{row.jobTitleText.trim().length >= 2 && <span className="caption-5 text-muted">{match ? 'Existing title' : 'New title will be created'}</span>}</label><label className="title-4 flex flex-col gap-1">Required workers<input type="number" min="1" step="1" className={fieldClass} value={row.vacancies} onChange={(e) => setPosition(index, { vacancies: e.target.value })} /></label><label className="title-4 flex flex-col gap-1">Salary offered<input type="number" min="0" className={fieldClass} value={row.salaryAmount} onChange={(e) => setPosition(index, { salaryAmount: e.target.value })} /></label>{row.salaryAmount !== '' && <label className="title-4 flex flex-col gap-1">Salary currency<input maxLength={3} className={fieldClass} value={row.salaryCurrency} onChange={(e) => setPosition(index, { salaryCurrency: e.target.value.toUpperCase() })} /></label>}<label className="title-4 flex flex-col gap-1">Initial candidate price<input type="number" min="0" className={fieldClass} value={row.priceAmount} onChange={(e) => setPosition(index, { priceAmount: e.target.value })} /></label><label className="title-4 flex flex-col gap-1">Price currency<input maxLength={3} className={fieldClass} value={row.priceCurrency} onChange={(e) => setPosition(index, { priceCurrency: e.target.value.toUpperCase() })} /></label></div>{positions.length > 1 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPositions((items) => items.filter((_, i) => i !== index))}>Remove position</Button>}</fieldset>; })}<Button variant="secondary" onClick={() => setPositions((items) => [...items, emptyPosition()])}>Add position</Button><p className="title-4">Total workers requested: {totalVacancies}</p></section>
        <section className="space-y-2"><h3 className="title-2">5. Save</h3><label className="title-4 flex max-w-xs flex-col gap-1">Expiry date (optional)<input type="date" className={fieldClass} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></label><p className="caption-5 text-muted">The system creates a demand ID automatically. Initial prices take effect when the demand is saved; later price changes require approval.</p></section>
      </div>}
      {error && <p role="alert" className="body-6 mt-4 text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || loading || !valid} onClick={() => void save()}>{busy ? 'Saving…' : 'Save demand'}</Button></div>
    </div>
  </div>;
}

export function DemandsPage(): JSX.Element {
  const { can } = useAuth(); const [open, setOpen] = useState(false); const [refresh, setRefresh] = useState(0);
  if (!can('catalogue.read', 'catalogue.manage')) return <EmptyState title="You do not have access to this page." />;
  return <div><PageHeader title="Demands" hint="Find and manage overseas job requirements." actions={can('catalogue.manage') ? <Button onClick={() => setOpen(true)}>Create demand</Button> : undefined} />
    <ListPage cfg={{ refreshKey: refresh, title: 'Demands', resource: 'demands', embedded: true, responsive: true, actionMenu: true, wideSearch: true, preserveQuery: true, searchPlaceholder: 'Search by company, demand ID, agency or job title', filters: [{ key: 'active', label: 'Status', type: 'select', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] }], columns: [
      { header: 'Company / demand', mobile: true, cell: (row: any) => <div><p className="title-4">{row.employer?.legalName || row.destinationCountry?.name || row.reference}</p><p className="caption-5 text-muted">Demand {row.reference}</p></div> },
      { header: 'Destination', mobile: true, className: 'hidden md:table-cell', cell: (row: any) => <div><p>{row.destinationCountry?.name || '—'}</p><p className="caption-5 text-muted">{row.overseasAgency?.name || 'Agency not linked'}</p></div> },
      { header: 'Positions', mobile: true, cell: (row: any) => { const positions = row.positions ?? []; return <div className="space-y-1">{positions.slice(0, 2).map((p: any) => <p key={p.id}>{p.jobTitle?.title} · {p.vacancies}</p>)}{positions.length > 2 && <details onClick={(e) => e.stopPropagation()}><summary className="caption-5 cursor-pointer text-muted">+ {positions.length - 2} more</summary>{positions.slice(2).map((p: any) => <p key={p.id}>{p.jobTitle?.title} · {p.vacancies}</p>)}</details>}</div>; } },
      { header: 'Workers selected / requested', mobile: true, cell: (row: any) => { const positions = row.positions ?? []; const required = positions.reduce((n: number, p: any) => n + p.vacancies, 0); const selected = positions.reduce((n: number, p: any) => n + (p.applications ?? []).length, 0); return <span>{selected} / {required}</span>; } },
      { header: 'Expiry', mobile: true, className: 'hidden lg:table-cell', cell: (row: any) => row.expiresOn ? displayDate(row.expiresOn, true) : 'No expiry' },
      { header: 'Status', mobile: true, cell: (row: any) => <StatusBadge value={row.active ? 'ACTIVE' : 'INACTIVE'} /> },
    ], rowTo: (row: any) => `/demands/${row.id}`, rowActions: [
      { label: 'Edit demand', perm: ['catalogue.manage'], form: (row: any) => ({ title: 'Edit demand', path: `/resource/demands/${row.id}`, method: 'PATCH', fields: [{ name: 'expiresOn', label: 'Expiry date', type: 'date' }] }), initial: (row: any) => ({ expiresOn: dateInputValue(row.expiresOn, true) }) },
      { label: row => row.active ? 'Deactivate demand' : 'Activate demand', perm: ['catalogue.manage'], method: 'PATCH', path: (row: any) => `/resource/demands/${row.id}`, body: (row: any) => ({ active: !row.active }), confirmTitle: 'Change demand availability?' },
    ], empty: { title: 'No demands yet.', hint: 'Create a demand to add job positions and worker quantities.' } }} />
    {open && <DemandCreate onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setRefresh((v) => v + 1); }} />}
  </div>;
}

function selectedDateToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

function inactivePriceLabel(prices: any[], hasApproved: boolean): string {
  if (prices.some((price) => price.approvalStatus === 'PENDING_APPROVAL')) return 'PRICE PENDING APPROVAL';
  if (prices.some((price) => price.approvalStatus === 'DRAFT')) return 'PRICE DRAFT';
  if (prices.some((price) => price.approvalStatus === 'REJECTED')) return 'PRICE REJECTED';
  return hasApproved ? 'NO CURRENT PRICE' : 'PRICE NOT ENTERED';
}

function SummaryMetric({ label, value }: { label: string; value: string | number }): JSX.Element {
  return <div className="min-w-0 py-1">
    <dt className="caption-4 text-muted">{label}</dt>
    <dd className="title-2 mt-1 tabular-nums">{value}</dd>
  </div>;
}

function OverviewRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return <div className="grid gap-1 py-3 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.4fr)] sm:gap-4">
    <dt className="caption-4 text-muted">{label}</dt>
    <dd className="body-5 min-w-0">{children}</dd>
  </div>;
}

export function DemandDetailPage(): JSX.Element {
  const { can } = useAuth(); const { id = '' } = useParams(); const location = useLocation(); const { data, loading, error, reload } = useOne<any>('demands', id);
  const [tab, setTab] = useState('overview'); const [priceMeta, setPriceMeta] = useState<Meta | null>(null); const [priceTarget, setPriceTarget] = useState<{ positionId?: string; row?: any; initial?: boolean } | null>(null);
  const [selectionTarget, setSelectionTarget] = useState<{ application: any; open: boolean } | null>(null); const [positionTarget, setPositionTarget] = useState<any | null>(null); const [selectionError, setSelectionError] = useState('');
  const [priceSubmitNotice, setPriceSubmitNotice] = useState<{ id: string; text: string; success: boolean } | null>(null);
  const [submittingPriceId, setSubmittingPriceId] = useState('');
  const [workerData, setWorkerData] = useState<any[]>([]); const [workersLoading, setWorkersLoading] = useState(false); const [workersError, setWorkersError] = useState(''); const [workerVersion, setWorkerVersion] = useState(0);
  useEffect(() => { api<{ data: Meta }>('/catalogue/meta').then((result) => setPriceMeta(result.data)).catch(() => setPriceMeta(null)); }, []);
  const canViewWorkers = can('candidate.read') && can('application.read');
  useEffect(() => {
    if (!canViewWorkers || !id) { setWorkerData([]); return; }
    let ignore = false; setWorkerData([]); setWorkersLoading(true); setWorkersError('');
    api<{ data: any[] }>(`/catalogue/demands/${id}/workers`).then((result) => { if (!ignore) setWorkerData(result.data ?? []); }).catch((e) => { if (!ignore) setWorkersError(e instanceof Error ? e.message : 'Could not load selected workers.'); }).finally(() => { if (!ignore) setWorkersLoading(false); });
    return () => { ignore = true; };
  }, [canViewWorkers, id, data?.positions?.length, workerVersion]);
  if (!can('catalogue.read', 'catalogue.manage')) return <EmptyState title="You do not have access to this page." />;
  if (loading) return <SkeletonRows rows={7} />;
  if (error || !data) return <ErrorState message={error || 'Demand not found.'} />;
  const positions = (data.positions ?? []).map((position: any) => ({ ...position, applications: workerData.find((row) => row.id === position.id)?.applications ?? [] })); const required = positions.reduce((n: number, position: any) => n + position.vacancies, 0);
  const selectedApps = positions.flatMap((position: any) => (position.applications ?? []).filter((app: any) => app.selectedAt).map((application: any) => ({ position, application })));
  const selectedCount = selectedApps.length; const priceTotal = (price: any) => (price.components ?? []).filter((part: any) => part.payer === 'CANDIDATE').reduce((sum: number, part: any) => sum + Number(part.amount), 0);
  const selectionCountLabel = !canViewWorkers ? 'Restricted' : workersLoading ? 'Loading…' : workersError ? 'Unavailable' : String(selectedCount);
  async function decide(price: any, decision: 'APPROVED' | 'REJECTED') { const reason = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} reason`); if (!reason || reason.trim().length < 3) return; try { await api(`/catalogue/decide/price-versions/${price.id}`, { method: 'POST', body: { decision, reason: reason.trim() } }); reload(); } catch (e) { setSelectionError(e instanceof Error ? e.message : 'Could not record the price decision.'); } }
  async function submitPrice(id: string) {
    setSubmittingPriceId(id); setPriceSubmitNotice(null);
    try {
      await api(`/catalogue/submit/price-versions/${id}`, { method: 'POST', body: {} });
      setPriceSubmitNotice({ id, text: 'Price submitted for approval.', success: true }); reload();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Could not submit price for approval.';
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      setPriceSubmitNotice({ id, text: requestId ? `${message} (Request ID: ${requestId})` : message, success: false });
    }
    finally { setSubmittingPriceId(''); }
  }
  async function activateInitialPrice(price: any) {
    if (!window.confirm('Set this reviewed price as the initial active price? It will take effect immediately.')) return;
    try { await api(`/catalogue/price-versions/${price.id}/activate-initial`, { method: 'POST', body: {} }); reload(); }
    catch (e) { setSelectionError(e instanceof Error ? e.message : 'Could not activate the initial price.'); }
  }
  async function removeSelection(application: any) { if (!window.confirm(`Remove ${application.candidate.fullName} from the selected workers list?`)) return; try { await api(`/intake/applications/${application.id}/selection`, { method: 'PATCH', body: { selectedAt: null } }); setWorkerVersion((v) => v + 1); reload(); setSelectionError(''); } catch (e) { setSelectionError(e instanceof Error ? e.message : 'Could not update the selection.'); } }
  const selectionForm = (app: any) => ({ title: app.selectedAt ? 'Update selected worker' : 'Select worker', path: `/intake/applications/${app.id}/selection`, method: 'PATCH' as const, fields: [
    { name: 'selectedAt', label: 'Selected date', type: 'date' as const, required: true },
    ...(['photoStatus', 'pccStatus', 'medicalStatus'] as const).map((name) => ({ name, label: name === 'pccStatus' ? 'PCC' : name === 'medicalStatus' ? 'Medical' : 'Photo', type: 'select' as const, options: [{ value: 'PENDING', label: 'Pending' }, { value: 'DONE', label: 'Done' }] })),
    { name: 'remarks', label: 'Remarks', type: 'textarea' as const },
  ] });
  return <div>
    <Link className="caption-4 mb-3 inline-flex text-muted hover:text-fg" to={`/demands${location.search}`}>← Back to demands</Link>
    <PageHeader title={data.employer?.legalName || data.destinationCountry?.name || data.reference} hint={`Demand ${data.reference} · ${data.destinationCountry?.name || 'Destination not set'} · ${data.active ? 'Active' : 'Inactive'}`} />
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-line py-3 sm:grid-cols-3"><SummaryMetric label="Workers requested" value={required} /><SummaryMetric label="Workers selected" value={selectionCountLabel} />{canViewWorkers && !workersLoading && !workersError && <SummaryMetric label="Vacancies remaining" value={Math.max(0, required - selectedCount)} />}</dl>
    <div role="tablist" aria-label="Demand details" className="mt-6 flex flex-wrap gap-2 border-b border-line pb-2">{[['overview', 'Overview'], ['positions', 'Pricing'], ['workers', 'Selected Workers']].map(([key, label]) => <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'primary' : 'ghost'} onClick={() => setTab(key)}>{label}</Button>)}</div>
    {tab === 'overview' && <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1.1fr)]"><section><h2 className="title-3">Demand information</h2><dl className="mt-2 divide-y divide-line border-y border-line"><OverviewRow label="Company">{data.employer?.legalName || '—'}</OverviewRow><OverviewRow label="Destination country">{data.destinationCountry?.name || '—'}</OverviewRow><OverviewRow label="Overseas agency">{data.overseasAgency?.name || 'Not linked'}</OverviewRow><OverviewRow label="Created date">{displayDate(data.createdAt)}</OverviewRow><OverviewRow label="Expiry date">{data.expiresOn ? displayDate(data.expiresOn, true) : 'No expiry'}</OverviewRow><OverviewRow label="Status"><StatusBadge value={data.active ? 'ACTIVE' : 'INACTIVE'} /></OverviewRow></dl></section><section><h2 className="title-3">Requested positions</h2><div className="mt-2 divide-y divide-line border-y border-line">{positions.map((position: any) => <article key={position.id} className="py-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="title-4">{position.jobTitle?.title || 'Position'}</h3><span className="body-5 tabular-nums">{position.vacancies} workers</span></div><dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">{position.salaryAmount != null && <div className="flex gap-2"><dt className="caption-5 text-muted">Salary</dt><dd className="caption-5">{position.salaryCurrency} {position.salaryAmount}</dd></div>}{position.city?.name && <div className="flex gap-2"><dt className="caption-5 text-muted">City</dt><dd className="caption-5">{position.city.name}</dd></div>}{position.terms && <div className="sm:col-span-2"><dt className="caption-5 text-muted">Position details</dt><dd className="body-6 mt-1 whitespace-pre-wrap">{position.terms}</dd></div>}</dl></article>)}</div></section></div>}
    {selectionError && <p role="alert" className="body-6 mt-3 text-danger">{selectionError}</p>}
    {tab === 'positions' && <div className="mt-5 space-y-4">{positions.map((position: any) => {
      const versions = position.priceVersions ?? []; const chosen = (position.applications ?? []).filter((app: any) => app.selectedAt).length; const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date()); const current = versions.find((price: any) => price.approvalStatus === 'APPROVED' && price.effectiveFrom?.slice(0, 10) <= todayKey && (!price.effectiveTo || price.effectiveTo.slice(0, 10) >= todayKey)); const pending = versions.find((price: any) => price.approvalStatus === 'PENDING_APPROVAL');
      const established = versions.some((price: any) => price.approvalStatus === 'APPROVED'); const drafts = versions.filter((price: any) => price.approvalStatus === 'DRAFT'); const initialDraft = !established && !pending && versions.length === 1 && drafts.length === 1 ? drafts[0] : null; const unresolved = !established && !pending && versions.length > 0 && !initialDraft; const editableDraft = drafts[0];
      const inactivePriceStatus = inactivePriceLabel(versions, established);
      const selectionProgress = !canViewWorkers ? 'Selection data restricted' : workersLoading ? 'Loading selected workers…' : workersError ? 'Selected worker count unavailable' : `${chosen} selected · ${Math.max(0, position.vacancies - chosen)} remaining`;
      return <article key={position.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="title-3">{position.jobTitle?.title}</h3><p className="body-6 mt-1 text-muted">{position.vacancies} workers · {selectionProgress}</p>{position.salaryAmount != null && <p className="caption-5 mt-2 text-muted">Salary offered: {position.salaryCurrency} {position.salaryAmount}</p>}</div><div className="flex gap-2">{can('catalogue.manage') && <><Button size="sm" variant="secondary" disabled={!!pending || unresolved} onClick={() => initialDraft ? setPriceTarget({ row: initialDraft, initial: true }) : editableDraft ? setPriceTarget({ row: editableDraft, initial: !established }) : setPriceTarget({ positionId: position.id, initial: !established })}>{pending ? 'Price change pending' : initialDraft ? 'Review initial draft' : unresolved ? 'Review price history' : editableDraft ? 'Edit price draft' : established ? 'Propose price change' : 'Add initial price'}</Button><Button size="sm" variant="secondary" onClick={() => setPositionTarget(position)}>Edit position</Button></>}</div></div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">{current ? <div><span className="caption-5 text-muted">Approved current price</span><div className="title-3 mt-1"><Money currency={current.currency} amount={priceTotal(current)} /></div></div> : <StatusBadge value={inactivePriceStatus} />}{pending && <div className="flex flex-wrap items-center gap-2 sm:ml-4 sm:border-l sm:border-line sm:pl-4"><div><span className="caption-5 text-muted">Pending proposal</span><div className="title-4 mt-1"><Money currency={pending.currency} amount={priceTotal(pending)} /></div></div><StatusBadge value={pending.approvalStatus} />{can('catalogue.approve') && <><Button size="sm" onClick={() => void decide(pending, 'APPROVED')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => void decide(pending, 'REJECTED')}>Reject</Button></>}</div>}</div>
        {(position.priceVersions ?? []).length > 0 && <details className="mt-4">
          <summary className="caption-5 cursor-pointer">Price history ({position.priceVersions.length})</summary>
          <div className="mt-2 space-y-2">
            {position.priceVersions.map((price: any) => <div key={price.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
              <div className="min-w-32"><Money currency={price.currency} amount={priceTotal(price)} /></div><span className="caption-5">From {displayDate(price.effectiveFrom, true)}</span><span className="caption-5">To {price.effectiveTo ? displayDate(price.effectiveTo, true) : 'No end date'}</span><StatusBadge value={price.approvalStatus} />
              {can('catalogue.manage') && ['DRAFT', 'REJECTED'].includes(price.approvalStatus) && <>
                <Button size="sm" variant="secondary" onClick={() => setPriceTarget({ row: price, initial: !established })}>Edit draft</Button>
                {established && <Button size="sm" disabled={submittingPriceId === price.id} onClick={() => void submitPrice(price.id)}>{submittingPriceId === price.id ? 'Submitting…' : 'Submit for approval'}</Button>}
                {initialDraft?.id === price.id && <Button size="sm" onClick={() => void activateInitialPrice(price)}>Set as initial price</Button>}
              </>}
            </div>)}
          </div>
          {priceSubmitNotice && position.priceVersions.some((price: any) => price.id === priceSubmitNotice.id) && <p role={priceSubmitNotice.success ? 'status' : 'alert'} className={`body-6 mt-3 ${priceSubmitNotice.success ? 'text-muted' : 'text-danger'}`}>{priceSubmitNotice.text}</p>}
        </details>}
      </article>;
    })}{positions.length === 0 && <EmptyState title="No positions on this demand." />}</div>}
    {tab === 'workers' && <div className="mt-5">{can('application.create') && <Link to="/intake" className="button-sm mb-4 inline-flex rounded-lg border border-line px-3 py-2">Create applicant application</Link>}{can('export.run') && can('passport.view_number') && !workersLoading && !workersError && <a href={`/api/catalogue/demands/${data.id}/selection-list`} className="button-sm mb-4 ml-2 inline-flex rounded-lg bg-primary px-3 py-2 text-on-primary">Export selection list ({selectedCount})</a>}
      {!canViewWorkers ? <EmptyState title="Your role cannot view applicant selections." /> : workersLoading ? <SkeletonRows rows={5} /> : workersError ? <ErrorState message={workersError} /> : <>
      {selectedCount ? <div className="divide-y divide-line border-y border-line">{selectedApps.map(({ position, application }: any) => <article key={application.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="title-4 underline" to={`/candidates/${application.candidate.id}`}>{application.candidate.fullName}</Link><p className="caption-5 mt-1 text-muted">{position.jobTitle?.title} · {application.candidate.refer?.name || application.referralPartner?.name || 'Direct'}</p><p className="caption-5 mt-1 text-muted">Selected {displayDate(application.selectedAt)} · {application.candidate.passports?.some((passport: any) => passport.isCurrent) ? 'Current passport on file' : 'No current passport'}</p></div>{can('selection.manage') && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setSelectionTarget({ application, open: true })}>Update</Button><Button size="sm" variant="ghost" onClick={() => void removeSelection(application)}>Remove</Button></div>}</div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><span className="caption-5">Photo <StatusBadge value={application.photoStatus || 'PENDING'} /></span><span className="caption-5">PCC <StatusBadge value={application.pccStatus || 'PENDING'} /></span><span className="caption-5">Medical <StatusBadge value={application.medicalStatus || 'PENDING'} /></span></div>{application.selectionRemarks && <p className="body-6 mt-2">{application.selectionRemarks}</p>}</article>)}</div> : <EmptyState title="No workers selected yet." hint="Create an application for a position, then select the applicant here." />}
      {can('selection.manage') && <section className="mt-6"><h2 className="title-3">Available applicants</h2><div className="mt-2 space-y-2">{positions.flatMap((position: any) => (position.applications ?? []).filter((app: any) => !app.selectedAt).map((application: any) => <div key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"><div><p className="title-4">{application.candidate.fullName}</p><p className="caption-5 text-muted">{position.jobTitle?.title} · {application.candidate.refer?.name || application.referralPartner?.name || 'Direct'}</p></div><Button size="sm" onClick={() => setSelectionTarget({ application, open: true })}>Select worker</Button></div>))}</div></section>}
      </>}
    </div>}
    {selectionTarget && <FormDialog open form={selectionForm(selectionTarget.application)} initial={{ selectedAt: dateInputValue(selectionTarget.application.selectedAt) || selectedDateToday(), photoStatus: selectionTarget.application.photoStatus || 'PENDING', pccStatus: selectionTarget.application.pccStatus || 'PENDING', medicalStatus: selectionTarget.application.medicalStatus || 'PENDING', remarks: selectionTarget.application.selectionRemarks || '' }} onClose={() => setSelectionTarget(null)} onSaved={() => { setSelectionTarget(null); reload(); setWorkerVersion((v) => v + 1); }} />}
    {positionTarget && <FormDialog open form={{ title: 'Edit position', path: `/resource/positions/${positionTarget.id}`, method: 'PATCH', fields: [{ name: 'vacancies', label: 'Required workers', type: 'number', required: true }, { name: 'terms', label: 'Conditions', type: 'textarea' }] }} initial={{ vacancies: positionTarget.vacancies, terms: positionTarget.terms || '' }} onClose={() => setPositionTarget(null)} onSaved={() => { setPositionTarget(null); reload(); }} />}
    {priceTarget && priceMeta && <PriceVersionModal row={priceTarget.row} positionId={priceTarget.positionId} initialPrice={priceTarget.initial} meta={priceMeta} onClose={(saved) => { setPriceTarget(null); if (saved) reload(); }} />}
  </div>;
}
