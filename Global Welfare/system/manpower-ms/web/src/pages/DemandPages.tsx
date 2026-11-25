import { useEffect, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ListPage } from '../components/engines';
import { EmptyState, ErrorState, FormDialog, Money, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useOne, useResource } from '../lib/useApi';
import { PriceVersionModal, type Meta } from './PriceVersionModal';

type DraftPosition = { jobTitleId: string; vacancies: string; salaryAmount: string; salaryCurrency: string; priceAmount: string; priceCurrency: string };
const emptyPosition = (): DraftPosition => ({ jobTitleId: '', vacancies: '1', salaryAmount: '', salaryCurrency: 'NPR', priceAmount: '', priceCurrency: 'NPR' });
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
  const selectedAgency = agencies.data.find((row) => row.id === agencyId);
  const selectedCompany = employers.data.find((row) => row.id === employerId);
  const companyTitleIds = (selectedCompany?.jobTitles ?? []).map((link: any) => link.jobTitleId ?? link.jobTitle?.id);
  const availableTitles = companyTitleIds.length ? titles.data.filter((title) => companyTitleIds.includes(title.id)) : titles.data;
  const compatibleEmployers = employers.data.filter((row) => {
    const hasDestinationRules = (row.destinationCountries ?? []).length > 0;
    const supportsCountry = !hasDestinationRules || row.destinationCountries.some((link: any) => link.countryId === countryId || link.country?.id === countryId);
    const agencyIds = (row.overseasAgencies ?? []).map((link: any) => link.overseasAgencyId ?? link.overseasAgency?.id);
    const supportsAgency = !agencyIds.length || agencyIds.includes(agencyId);
    const agencyEmployerIds = (selectedAgency?.employers ?? []).map((link: any) => link.employerId ?? link.employer?.id);
    return supportsCountry && supportsAgency && (!agencyEmployerIds.length || agencyEmployerIds.includes(row.id));
  });
  const totalVacancies = positions.reduce((sum, row) => sum + (Number(row.vacancies) || 0), 0);
  const valid = !!countryId && !!agencyId && !!employerId && positions.length > 0 && positions.every((p) => !!p.jobTitleId && Number.isInteger(Number(p.vacancies)) && Number(p.vacancies) > 0 && p.priceAmount !== '' && /^[A-Z]{3}$/.test(p.priceCurrency) && Number(p.priceAmount) >= 0 && (p.salaryAmount === '' || Number(p.salaryAmount) >= 0));
  const setPosition = (index: number, value: Partial<DraftPosition>) => setPositions((items) => items.map((item, i) => i === index ? { ...item, ...value } : item));
  async function save() {
    setBusy(true); setError('');
    try {
      await api('/catalogue/demands/with-positions', { method: 'POST', body: {
        destinationCountryId: countryId, overseasAgencyId: agencyId, employerId, expiresOn: expiresOn || null,
        positions: positions.map((p) => ({ jobTitleId: p.jobTitleId, vacancies: Number(p.vacancies), salaryAmount: p.salaryAmount === '' ? null : Number(p.salaryAmount), salaryCurrency: p.salaryCurrency, terms: null, priceAmount: Number(p.priceAmount), priceCurrency: p.priceCurrency })),
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
        <section className="space-y-3"><h3 className="title-2">3. Company</h3><select className={fieldClass} value={employerId} disabled={!countryId || !agencyId} onChange={(e) => setEmployerId(e.target.value)}><option value="">Select company</option>{compatibleEmployers.map((row) => <option key={row.id} value={row.id}>{row.legalName}</option>)}</select>{!compatibleEmployers.length && countryId && agencyId && <p className="caption-5 text-muted">No linked companies match these choices. Add a company from the overseas agency page.</p>}</section>
        <section className="space-y-3"><div><h3 className="title-2">4. Job positions</h3><p className="caption-4 text-muted">Vacancies are the number of workers requested for each title.</p></div>{positions.map((row, index) => <fieldset key={index} className="rounded-xl border border-line p-4"><legend className="title-4 px-1">Position {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2"><label className="title-4 flex flex-col gap-1 sm:col-span-2">Job title<select className={fieldClass} value={row.jobTitleId} onChange={(e) => setPosition(index, { jobTitleId: e.target.value })}><option value="">Select a reusable job title</option>{availableTitles.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="title-4 flex flex-col gap-1">Required workers<input type="number" min="1" step="1" className={fieldClass} value={row.vacancies} onChange={(e) => setPosition(index, { vacancies: e.target.value })} /></label><label className="title-4 flex flex-col gap-1">Salary offered<input type="number" min="0" className={fieldClass} value={row.salaryAmount} onChange={(e) => setPosition(index, { salaryAmount: e.target.value })} /></label><label className="title-4 flex flex-col gap-1">Salary currency<input maxLength={3} className={fieldClass} value={row.salaryCurrency} onChange={(e) => setPosition(index, { salaryCurrency: e.target.value.toUpperCase() })} /></label><label className="title-4 flex flex-col gap-1">Initial candidate price<input type="number" min="0" className={fieldClass} value={row.priceAmount} onChange={(e) => setPosition(index, { priceAmount: e.target.value })} /></label><label className="title-4 flex flex-col gap-1">Price currency<input maxLength={3} className={fieldClass} value={row.priceCurrency} onChange={(e) => setPosition(index, { priceCurrency: e.target.value.toUpperCase() })} /></label></div>{positions.length > 1 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPositions((items) => items.filter((_, i) => i !== index))}>Remove position</Button>}</fieldset>)}<Button variant="secondary" onClick={() => setPositions((items) => [...items, emptyPosition()])}>Add position</Button><p className="title-4">Total workers requested: {totalVacancies}</p></section>
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
  return <div><PageHeader title="Demands" hint="Overseas job requests, grouped by company and worker requirements." actions={can('catalogue.manage') ? <Button onClick={() => setOpen(true)}>Create demand</Button> : undefined} />
    <ListPage key={refresh} cfg={{ title: 'Recruitment demands', hint: 'Search by demand ID, company, agency or job title.', resource: 'demands', filters: [{ key: 'active', label: 'Status', type: 'select', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] }], columns: [
      { header: 'Demand ID', cell: (row: any) => row.reference }, { header: 'Country', cell: (row: any) => row.destinationCountry?.name || '—' }, { header: 'Overseas agency', cell: (row: any) => row.overseasAgency?.name || 'Not linked' }, { header: 'Company', cell: (row: any) => row.employer?.legalName || '—' },
      { header: 'Positions', cell: (row: any) => <div className="max-w-sm space-y-1">{(row.positions ?? []).map((position: any) => <p key={position.id} className="body-6">{position.jobTitle?.title} · {position.vacancies}</p>)}</div> },
      { header: 'Workers requested', cell: (row: any) => (row.positions ?? []).reduce((total: number, position: any) => total + position.vacancies, 0) },
      { header: 'Selection progress', cell: (row: any) => { const required = (row.positions ?? []).reduce((n: number, p: any) => n + p.vacancies, 0); const selected = (row.positions ?? []).reduce((n: number, p: any) => n + (p.applications ?? []).filter((a: any) => a.selectedAt).length, 0); return `${selected} / ${required}`; } },
      { header: 'Status', cell: (row: any) => row.active ? <StatusBadge value="ACTIVE" /> : <StatusBadge value="INACTIVE" /> }, { header: 'Expiry', cell: (row: any) => row.expiresOn?.slice(0, 10) || 'No expiry' },
    ], rowTo: (row: any) => `/demands/${row.id}`, rowActions: [
      { label: 'Edit', perm: ['catalogue.manage'], form: (row: any) => ({ title: 'Edit demand', path: `/resource/demands/${row.id}`, method: 'PATCH', fields: [{ name: 'expiresOn', label: 'Expiry date', type: 'date' }] }), initial: (row: any) => ({ expiresOn: row.expiresOn?.slice(0, 10) ?? '' }) },
      { label: 'Toggle active', perm: ['catalogue.manage'], method: 'PATCH', path: (row: any) => `/resource/demands/${row.id}`, body: (row: any) => ({ active: !row.active }), confirmTitle: 'Change demand availability?' },
    ], empty: { title: 'No demands yet.', hint: 'Create a demand to add job positions and worker quantities.' } }} />
    {open && <DemandCreate onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setRefresh((v) => v + 1); }} />}
  </div>;
}

function selectedDateToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

export function DemandDetailPage(): JSX.Element {
  const { can } = useAuth(); const { id = '' } = useParams(); const { data, loading, error, reload } = useOne<any>('demands', id);
  const [tab, setTab] = useState('overview'); const [priceMeta, setPriceMeta] = useState<Meta | null>(null); const [priceTarget, setPriceTarget] = useState<{ positionId?: string; row?: any; initial?: boolean } | null>(null);
  const [selectionTarget, setSelectionTarget] = useState<{ application: any; open: boolean } | null>(null); const [positionTarget, setPositionTarget] = useState<any | null>(null); const [selectionError, setSelectionError] = useState('');
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
  async function decide(price: any, decision: 'APPROVED' | 'REJECTED') { const reason = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} reason`); if (!reason || reason.trim().length < 3) return; try { await api(`/catalogue/decide/price-versions/${price.id}`, { method: 'POST', body: { decision, reason: reason.trim() } }); reload(); } catch (e) { setSelectionError(e instanceof Error ? e.message : 'Could not record the price decision.'); } }
  async function removeSelection(application: any) { if (!window.confirm(`Remove ${application.candidate.fullName} from the selected workers list?`)) return; try { await api(`/intake/applications/${application.id}/selection`, { method: 'PATCH', body: { selectedAt: null } }); setWorkerVersion((v) => v + 1); reload(); setSelectionError(''); } catch (e) { setSelectionError(e instanceof Error ? e.message : 'Could not update the selection.'); } }
  const selectionForm = (app: any) => ({ title: app.selectedAt ? 'Update selected worker' : 'Select worker', path: `/intake/applications/${app.id}/selection`, method: 'PATCH' as const, fields: [
    { name: 'selectedAt', label: 'Selected date', type: 'date' as const, required: true },
    ...(['photoStatus', 'pccStatus', 'medicalStatus'] as const).map((name) => ({ name, label: name === 'pccStatus' ? 'PCC' : name === 'medicalStatus' ? 'Medical' : 'Photo', type: 'select' as const, options: [{ value: 'PENDING', label: 'Pending' }, { value: 'DONE', label: 'Done' }] })),
    { name: 'remarks', label: 'Remarks', type: 'textarea' as const },
  ] });
  return <div>
    <PageHeader title={data.reference} hint="Recruitment demand · worker requirements and selected applicants." actions={<Link className="button-sm rounded-lg border border-line px-3 py-2" to="/demands">All demands</Link>} />
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line p-4"><p className="caption-5 text-muted">Workers requested</p><p className="heading-6 mt-1">{required}</p></div><div className="rounded-xl border border-line p-4"><p className="caption-5 text-muted">Workers selected</p><p className="heading-6 mt-1">{selectedCount}</p></div><div className="rounded-xl border border-line p-4"><p className="caption-5 text-muted">Vacancies remaining</p><p className="heading-6 mt-1">{Math.max(0, required - selectedCount)}</p></div></div>
    <div role="tablist" aria-label="Demand details" className="mt-7 flex flex-wrap gap-2 border-b border-line pb-2">{[['overview', 'Overview'], ['positions', 'Positions & Pricing'], ['workers', 'Selected Workers']].map(([key, label]) => <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'primary' : 'ghost'} onClick={() => setTab(key)}>{label}</Button>)}</div>
    {tab === 'overview' && <dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="caption-5 text-muted">Destination country</dt><dd className="body-5 mt-1">{data.destinationCountry?.name || '—'}</dd></div><div><dt className="caption-5 text-muted">Overseas agency</dt><dd className="body-5 mt-1">{data.overseasAgency?.name || 'Not linked'}</dd></div><div><dt className="caption-5 text-muted">Company</dt><dd className="body-5 mt-1">{data.employer?.legalName || '—'}</dd></div><div><dt className="caption-5 text-muted">Created</dt><dd className="body-5 mt-1">{data.createdAt?.slice(0, 10) || '—'}</dd></div><div><dt className="caption-5 text-muted">Expiry</dt><dd className="body-5 mt-1">{data.expiresOn?.slice(0, 10) || 'No expiry'}</dd></div><div><dt className="caption-5 text-muted">Status</dt><dd className="mt-1"><StatusBadge value={data.active ? 'ACTIVE' : 'INACTIVE'} /></dd></div></dl>}
    {selectionError && <p role="alert" className="body-6 mt-3 text-danger">{selectionError}</p>}
    {tab === 'positions' && <div className="mt-5 space-y-4">{positions.map((position: any) => {
      const chosen = (position.applications ?? []).filter((app: any) => app.selectedAt).length; const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date()); const current = position.priceVersions?.find((price: any) => price.approvalStatus === 'APPROVED' && price.effectiveFrom?.slice(0, 10) <= todayKey && (!price.effectiveTo || price.effectiveTo.slice(0, 10) >= todayKey)); const pending = position.priceVersions?.find((price: any) => price.approvalStatus === 'PENDING_APPROVAL');
      const established = (position.priceVersions ?? []).some((price: any) => price.approvalStatus === 'APPROVED');
      return <article key={position.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="title-3">{position.jobTitle?.title}</h3><p className="body-6 mt-1 text-muted">{position.vacancies} workers · {chosen} selected · {Math.max(0, position.vacancies - chosen)} remaining</p>{position.salaryAmount != null && <p className="caption-5 mt-2 text-muted">Salary offered: {position.salaryCurrency} {position.salaryAmount}</p>}</div><div className="flex gap-2">{can('catalogue.manage') && <><Button size="sm" variant="secondary" onClick={() => setPriceTarget({ positionId: position.id, initial: !established })}>{established ? 'Propose price change' : 'Add initial price'}</Button><Button size="sm" variant="secondary" onClick={() => setPositionTarget(position)}>Edit position</Button></>}</div></div>
        <div className="mt-4 flex flex-wrap items-center gap-2">{current ? <><span className="caption-5">Current price</span><Money currency={current.currency} amount={priceTotal(current)} /></> : <StatusBadge value={established ? 'NO CURRENT PRICE' : 'PRICE NOT ENTERED'} />}{pending && <><span className="caption-5">Pending price</span><Money currency={pending.currency} amount={priceTotal(pending)} /><StatusBadge value={pending.approvalStatus} />{can('catalogue.approve') && <><Button size="sm" onClick={() => void decide(pending, 'APPROVED')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => void decide(pending, 'REJECTED')}>Reject</Button></>}</>}</div>
        {(position.priceVersions ?? []).length > 0 && <details className="mt-4"><summary className="caption-5 cursor-pointer">Price history ({position.priceVersions.length})</summary><div className="mt-2 space-y-2">{position.priceVersions.map((price: any) => <div key={price.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2"><Money currency={price.currency} amount={priceTotal(price)} /><span className="caption-5">From {price.effectiveFrom?.slice(0, 10)}</span><StatusBadge value={price.approvalStatus} />{can('catalogue.manage') && ['DRAFT', 'REJECTED'].includes(price.approvalStatus) && <><Button size="sm" variant="secondary" onClick={() => setPriceTarget({ row: price })}>Edit draft</Button><Button size="sm" onClick={async () => { await api(`/catalogue/submit/price-versions/${price.id}`, { method: 'POST' }); reload(); }}>Submit</Button></>}</div>)}</div></details>}
      </article>;
    })}{positions.length === 0 && <EmptyState title="No positions on this demand." />}</div>}
    {tab === 'workers' && <div className="mt-5">{can('application.create') && <Link to="/intake" className="button-sm mb-4 inline-flex rounded-lg border border-line px-3 py-2">Create applicant application</Link>}{can('export.run') && can('passport.view_number') && <a href={`/api/catalogue/demands/${data.id}/selection-list`} className="button-sm mb-4 ml-2 inline-flex rounded-lg bg-primary px-3 py-2 text-on-primary">Export Excel selection list ({selectedCount} PAX)</a>}
      {!canViewWorkers ? <EmptyState title="Your role cannot view applicant selections." /> : workersLoading ? <SkeletonRows rows={5} /> : workersError ? <ErrorState message={workersError} /> : <>
      {selectedCount ? <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[62rem] text-left"><thead className="bg-surface"><tr>{['Applicant', 'Job title', 'Passport', 'Refer', 'Selected date', 'Photo', 'PCC', 'Medical', 'Remarks', ''].map((label) => <th key={label} className="caption-4 p-3">{label}</th>)}</tr></thead><tbody>{selectedApps.map(({ position, application }: any) => <tr key={application.id} className="border-t border-line"><td className="body-6 p-3"><Link className="underline" to={`/candidates/${application.candidate.id}`}>{application.candidate.fullName}</Link><p className="caption-5 text-muted">{application.candidate.phone || ''}</p></td><td className="body-6 p-3">{position.jobTitle?.title}</td><td className="body-6 p-3">{application.candidate.passports?.some((passport: any) => passport.isCurrent) ? 'Current passport on file' : 'No current passport'}</td><td className="body-6 p-3">{application.candidate.refer?.name || application.referralPartner?.name || 'Direct'}</td><td className="body-6 p-3">{application.selectedAt?.slice(0, 10)}</td><td className="p-3"><StatusBadge value={application.photoStatus || 'PENDING'} /></td><td className="p-3"><StatusBadge value={application.pccStatus || 'PENDING'} /></td><td className="p-3"><StatusBadge value={application.medicalStatus || 'PENDING'} /></td><td className="body-6 p-3">{application.selectionRemarks || '—'}</td><td className="p-3">{can('selection.manage') && <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setSelectionTarget({ application, open: true })}>Update</Button><Button size="sm" variant="ghost" onClick={() => void removeSelection(application)}>Remove</Button></div>}</td></tr>)}</tbody></table></div> : <EmptyState title="No workers selected yet." hint="Create an application for a position, then select the applicant here." />}
      {can('selection.manage') && <div className="mt-5 space-y-3">{positions.flatMap((position: any) => (position.applications ?? []).filter((app: any) => !app.selectedAt).map((application: any) => <div key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"><div><p className="title-4">{application.candidate.fullName}</p><p className="caption-5 text-muted">{position.jobTitle?.title} · {application.candidate.refer?.name || application.referralPartner?.name || 'Direct'} · not selected</p></div><Button size="sm" onClick={() => setSelectionTarget({ application, open: true })}>Select worker</Button></div>))}</div>}
      </>}
    </div>}
    {selectionTarget && <FormDialog open form={selectionForm(selectionTarget.application)} initial={{ selectedAt: selectionTarget.application.selectedAt?.slice(0, 10) || selectedDateToday(), photoStatus: selectionTarget.application.photoStatus || 'PENDING', pccStatus: selectionTarget.application.pccStatus || 'PENDING', medicalStatus: selectionTarget.application.medicalStatus || 'PENDING', remarks: selectionTarget.application.selectionRemarks || '' }} onClose={() => setSelectionTarget(null)} onSaved={() => { setSelectionTarget(null); reload(); setWorkerVersion((v) => v + 1); }} />}
    {positionTarget && <FormDialog open form={{ title: 'Edit position', path: `/resource/positions/${positionTarget.id}`, method: 'PATCH', fields: [{ name: 'vacancies', label: 'Required workers', type: 'number', required: true }, { name: 'terms', label: 'Conditions', type: 'textarea' }] }} initial={{ vacancies: positionTarget.vacancies, terms: positionTarget.terms || '' }} onClose={() => setPositionTarget(null)} onSaved={() => { setPositionTarget(null); reload(); }} />}
    {priceTarget && priceMeta && <PriceVersionModal row={priceTarget.row} positionId={priceTarget.positionId} initialPrice={priceTarget.initial} meta={priceMeta} onClose={(saved) => { setPriceTarget(null); if (saved) reload(); }} />}
  </div>;
}
