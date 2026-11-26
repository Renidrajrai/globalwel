import { useState, type FormEvent, type JSX } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { DetailPage, ListPage } from '../components/engines';
import { EmptyState, ErrorState, FormDialog, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useResource } from '../lib/useApi';

const regionOptions = [{ value: 'EUROPE', label: 'Europe' }, { value: 'GULF', label: 'Gulf' }];
const countryEditForm = { title: 'Edit country', path: '', method: 'PATCH' as const, fields: [{ name: 'name', label: 'Country name', required: true }] };
export function CountryManagementDrawer({ onClose, onCreated }: { onClose: () => void; onCreated?: (country: any) => void }): JSX.Element {
  const { can } = useAuth();
  const canRead = can('catalogue.read', 'catalogue.manage'); const canManage = can('catalogue.manage');
  const { data, loading, error, reload, mutate, setData } = useResource<any>('countries', {}, 1, 300);
  const [addOpen, setAddOpen] = useState(false); const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [notice, setNotice] = useState(''); const [moveError, setMoveError] = useState('');
  const [editingCountry, setEditingCountry] = useState<any>(null);
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState(''); const [name, setName] = useState(''); const [region, setRegion] = useState('');
  if (!canRead) return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><section role="dialog" aria-modal="true" className="rounded-xl border border-line bg-bg p-6"><EmptyState title="You do not have access to country management." /><Button onClick={onClose}>Close</Button></section></div>;
  const visible = data.filter((row) => (!query.trim() || `${row.name} ${row.iso3Code} ${row.iso2Code}`.toLowerCase().includes(query.trim().toLowerCase())) && (!status || String(row.active) === status));
  async function addCountry(e: FormEvent) {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const result = await api<{ data: any }>('/resource/countries', { method: 'POST', body: { name, region: region || null } });
      setData((rows) => [...rows, result.data]); setName(''); setRegion(''); setAddOpen(false); setNotice(`${result.data.name} was added to Destination Countries.`); onCreated?.(result.data);
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Could not add this country.'); }
    finally { setSaving(false); }
  }
  async function changeRegion(row: any, next: string) {
    try { const result = await api<{ data: any }>(`/resource/countries/${row.id}`, { method: 'PATCH', body: { region: next || null } }); mutate(row.id, result.data); setMoveError(''); }
    catch (err) { setMoveError(err instanceof Error ? err.message : 'Could not update the country region.'); }
  }
  async function changeActive(row: any) {
    try { const result = await api<{ data: any }>(`/resource/countries/${row.id}`, { method: 'PATCH', body: { active: !row.active } }); mutate(row.id, result.data); setMoveError(''); }
    catch (err) { setMoveError(err instanceof Error ? err.message : 'Could not update the country status.'); }
  }
  async function move(id: string, nextRegion: string | null, beforeId?: string) {
    const row = data.find((item) => item.id === id); if (!row || !canManage) return;
    const target = data.filter((item) => (item.region ?? null) === nextRegion && item.id !== id).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    const at = beforeId ? target.findIndex((item) => item.id === beforeId) : -1;
    target.splice(at < 0 ? target.length : at, 0, { ...row, region: nextRegion });
    const previous = data; const orderedIds = target.map((item) => item.id); const next = data.map((item) => { const index = orderedIds.indexOf(item.id); return index < 0 ? item : { ...item, region: nextRegion, displayOrder: (index + 1) * 10 }; });
    setData(next);
    try { await api('/resource/countries/reorder', { method: 'POST', body: { region: nextRegion, orderedIds } }); setMoveError(''); }
    catch (err) { setData(previous); setMoveError(err instanceof Error ? err.message : 'Could not save the country order.'); }
  }
  const flag = (iso2?: string) => iso2 && /^[A-Z]{2}$/i.test(iso2) ? String.fromCodePoint(...[...iso2.toUpperCase()].map((letter) => 127397 + letter.charCodeAt(0))) : '◉';
  return <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Destination Countries" className="rise flex h-full w-full max-w-2xl flex-col border-l border-line bg-bg shadow-xl">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7"><div><h2 className="heading-6">Destination Countries</h2><p className="body-6 mt-1 text-muted">Search and manage destination countries by business region.</p></div><Button variant="ghost" onClick={onClose} aria-label="Close country manager">×</Button></header>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4 sm:px-7"><input type="search" aria-label="Search countries" placeholder="Search countries…" value={query} onChange={(e) => setQuery(e.target.value)} className="body-3 min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary"/><select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="body-6 rounded-lg border border-line bg-surface px-3 py-2"><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>{canManage && <Button size="sm" onClick={() => { setFormError(''); setAddOpen(true); }}>+ Add Country</Button>}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
        {notice && <p role="status" className="body-6 mb-3 rounded-lg border border-primary/30 bg-soft-matcha p-3 text-fg">{notice}</p>}
        {moveError && <p role="alert" className="body-6 mb-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-danger">{moveError}</p>}
        {loading ? <SkeletonRows rows={7} /> : error ? <ErrorState message={error} retry={reload} /> : visible.length === 0 ? <EmptyState title="No countries match this search." hint="Try another search or clear the status filter." /> : <div className="space-y-6">
      {(['EUROPE', 'GULF', ''] as const).map((code) => {
        const title = code === 'EUROPE' ? 'Europe' : code === 'GULF' ? 'Gulf' : 'Unassigned';
        const rows = visible.filter((row) => (row.region ?? '') === code).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
        return <section key={code || 'unassigned'} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) void move(id, code || null); }} aria-label={`${title} countries`} className="rounded-xl border border-line p-4">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="title-2">{title}</h2><span className="caption-5 text-muted">{rows.length}</span></div>
          {rows.length ? <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">{rows.map((row) => <article key={row.id} draggable={canManage} onDragStart={(e) => { e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id && id !== row.id) void move(id, row.region ?? null, row.id); }} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4"><div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="text-xl">{flag(row.iso2Code)}</span><div><p className="title-4">{row.name}</p><p className="caption-5 mt-1 text-muted">{row.iso2Code} · {row.active ? 'Active' : 'Inactive'}</p></div></div><div className="flex flex-wrap items-center gap-2">{canManage && <select aria-label={`Move ${row.name} to a region`} className="body-6 rounded-lg border border-line bg-bg px-2 py-1.5" value={row.region ?? ''} onChange={(e) => void changeRegion(row, e.target.value)}><option value="">Unassigned</option>{regionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}<span className={`caption-5 rounded-full px-2 py-1 ${row.active ? 'bg-soft-matcha text-primary' : 'bg-surface text-muted'}`}>{row.active ? 'Active' : 'Inactive'}</span>{canManage && <><Button size="sm" variant="secondary" onClick={() => setEditingCountry(row)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => void changeActive(row)}>{row.active ? 'Deactivate' : 'Activate'}</Button></>}</div>{editingCountry?.id === row.id && <FormDialog open form={{ ...countryEditForm, path: `/resource/countries/${row.id}` }} initial={{ name: row.name }} onClose={() => setEditingCountry(null)} onSaved={() => { setEditingCountry(null); reload(); }} />}</article>)}</div> : <p className="body-6 py-3 text-muted">No countries in this group.</p>}
        </section>;
      })}
    </div>}
      </div>
    </section>
    {addOpen && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4"><form role="dialog" aria-modal="true" aria-label="Add Country" onSubmit={(e) => void addCountry(e)} className="w-full max-w-md rounded-2xl border border-line bg-bg p-6 shadow-xl"><div className="flex items-center justify-between"><h3 className="heading-6">Add Country</h3><Button type="button" variant="ghost" aria-label="Close add country form" onClick={() => setAddOpen(false)}>×</Button></div><p className="body-6 mt-1 text-muted">Country codes are filled from the country database.</p><label className="title-4 mt-5 flex flex-col gap-1">Country name<input autoFocus required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="body-3 rounded-lg border border-line bg-surface px-3 py-2" placeholder="Country name"/></label><label className="title-4 mt-4 flex flex-col gap-1">Business region (optional)<select value={region} onChange={(e) => setRegion(e.target.value)} className="body-3 rounded-lg border border-line bg-surface px-3 py-2"><option value="">Unassigned</option>{regionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{formError && <p role="alert" className="body-6 mt-3 text-danger">{formError}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !canManage}>{saving ? 'Adding…' : 'Add Country'}</Button></div></form></div>}
  </div>;
}

function ReferDetail(): JSX.Element {
  const { id = '' } = useParams();
  return <DetailPage cfg={{ resource: 'referral-partners', title: (row) => row.name, hint: () => 'Refer source and associated applicants.', fields: [
    { label: 'Contact', value: (row) => row.contact || 'Not provided' }, { label: 'Notes', value: (row) => row.notes || 'None' }, { label: 'Linked applicants', value: (row) => row._count?.referredCandidates ?? 0 },
  ], tabs: [
    { key: 'applicants', label: 'Applicants', perm: ['candidate.read'], render: () => <ListPage cfg={{ title: 'Applicants from this Refer', resource: 'candidates', fixed: { referId: id }, columns: [{ header: 'Name', cell: (row: any) => row.fullName }, { header: 'Code', cell: (row: any) => row.candidateCode }, { header: 'Contact', cell: (row: any) => row.phone || '—' }], rowTo: (row: any) => `/candidates/${row.id}`, empty: { title: 'No applicants are linked to this Refer yet.' } }} /> },
    { key: 'workers', label: 'Selected workers', perm: ['application.read'], render: () => <ListPage cfg={{ title: 'Selections from this Refer', resource: 'applications', fixed: { referralPartnerId: id, selected: 'true' }, columns: [{ header: 'Applicant', cell: (row: any) => row.candidate?.fullName }, { header: 'Company', cell: (row: any) => row.position?.demand?.employer?.legalName || '—' }, { header: 'Position', cell: (row: any) => row.position?.jobTitle?.title || '—' }, { header: 'Selected', cell: (row: any) => row.selectedAt?.slice(0, 10) || 'Not selected' }], rowTo: (row: any) => `/applications/${row.id}`, empty: { title: 'No applicants from this Refer have been selected yet.' } }} /> },
  ] }} />;
}

function AgencyCompaniesTab({ id }: { id: string }): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return <>
    <div className="mb-3 flex justify-end"><Button size="sm" variant="secondary" onClick={() => setLinkOpen(true)}>Link existing company</Button></div>
    <ListPage cfg={{ refreshKey: revision, title: 'Associated companies', hint: 'Companies linked to this agency.', resource: 'employers', fixed: { overseasAgencyId: id }, columns: [
      { header: 'Company', cell: (company: any) => company.legalName },
      { header: 'Destination', cell: (company: any) => company.destinationCountries?.map((link: any) => link.country.name).join(', ') || '—' },
      { header: 'Active', cell: (company: any) => company.active ? 'Yes' : 'No' },
    ], rowTo: (company: any) => `/companies/${company.id}`, rowActions: [
      { label: 'Edit company', perm: ['catalogue.manage'], form: (company: any) => ({ title: 'Edit company', path: `/resource/employers/${company.id}`, method: 'PATCH', fields: [{ name: 'legalName', label: 'Company name', required: true }, { name: 'contactName', label: 'Contact person' }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' }] }), initial: (company: any) => company },
      { label: 'Toggle active', method: 'PATCH', path: (company: any) => `/resource/employers/${company.id}`, body: (company: any) => ({ active: !company.active }), perm: ['catalogue.manage'] },
    ], primary: { label: 'Add company', perm: ['catalogue.manage'], form: { title: 'Add company to agency', path: `/resource/overseas-agencies/${id}/companies`, fields: [
      { name: 'legalName', label: 'Company name', required: true }, { name: 'destinationCountryId', label: 'Destination country', type: 'select', required: true, optionsResource: { resource: 'countries', params: { active: 'true' }, label: (country: any) => country.name } },
      { name: 'contactName', label: 'Contact person' }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' },
    ] } }, empty: { title: 'No companies have been added to this agency yet.' } }} />
    {linkOpen && <FormDialog open form={{ title: 'Link existing company', path: `/resource/overseas-agencies/${id}/companies/link`, fields: [
      { name: 'employerId', label: 'Company', type: 'select', required: true, optionsResource: { resource: 'employers', params: { active: 'true' }, label: (company: any) => company.legalName } },
    ] }} onClose={() => setLinkOpen(false)} onSaved={() => { setLinkOpen(false); setRevision((value) => value + 1); }} />}
  </>;
}

function OverseasAgencyDetail(): JSX.Element {
  const { id = '' } = useParams();
  return <DetailPage cfg={{ resource: 'overseas-agencies', title: (row) => row.name, hint: (row) => `Overseas agency · ${row.country?.name ?? 'Country not set'}`, fields: [
    { label: 'Country', value: (row) => row.country?.name || 'None' }, { label: 'Contact person', value: (row) => row.contactName || 'None' },
    { label: 'Phone', value: (row) => row.phone || 'None' }, { label: 'Email', value: (row) => row.email || 'None' }, { label: 'Notes', value: (row) => row.notes || 'None' },
  ], tabs: [
    { key: 'companies', label: 'Companies & Job Titles', render: () => <AgencyCompaniesTab id={id} /> },
    { key: 'demands', label: 'Demands', render: () => <ListPage cfg={{ title: 'Agency demands', resource: 'demands', fixed: { overseasAgencyId: id }, columns: [
      { header: 'Demand', cell: (row: any) => row.reference },
      { header: 'Company', cell: (row: any) => row.employer?.legalName || '—' },
      { header: 'Country', cell: (row: any) => row.destinationCountry?.name || '—' },
      { header: 'Positions', cell: (row: any) => (row.positions ?? []).map((position: any) => `${position.jobTitle?.title} · ${position.vacancies}`).join(', ') || '—' },
      { header: 'Requested', cell: (row: any) => (row.positions ?? []).reduce((sum: number, position: any) => sum + position.vacancies, 0) },
      { header: 'Selected', cell: (row: any) => (row.positions ?? []).reduce((sum: number, position: any) => sum + (position.applications?.length ?? 0), 0) },
      { header: 'Remaining', cell: (row: any) => { const positions = row.positions ?? []; const requested = positions.reduce((sum: number, position: any) => sum + position.vacancies, 0); const selected = positions.reduce((sum: number, position: any) => sum + (position.applications?.length ?? 0), 0); return Math.max(0, requested - selected); } },
      { header: 'Status', cell: (row: any) => row.active ? 'Active' : 'Inactive' },
    ], rowTo: (row: any) => `/demands/${row.id}`, empty: { title: 'No recruitment demands are linked to this agency yet.' } }} /> },
  ] }} />;
}

export function AgenciesPage(): JSX.Element {
  const { can } = useAuth(); const { id } = useParams(); const location = useLocation(); const [tab, setTab] = useState('overseas');
  if (!can('catalogue.read', 'catalogue.manage')) return <EmptyState title="You do not have access to this page." />;
  if (id) return location.pathname.startsWith('/refers/') ? <ReferDetail /> : <OverseasAgencyDetail />;
  const tabs = [{ key: 'overseas', label: 'Overseas Agencies' }, { key: 'refer', label: 'Refer' }];
  return <div><PageHeader title="Agencies" hint="Overseas agencies bring job opportunities. Refer sources bring applicants." />
    <div role="tablist" aria-label="Agency types" className="mb-5 flex gap-2 border-b border-line pb-2">{tabs.map((item) => <Button key={item.key} role="tab" aria-selected={tab === item.key} variant={tab === item.key ? 'primary' : 'ghost'} onClick={() => setTab(item.key)}>{item.label}</Button>)}</div>
    {tab === 'overseas' ? <ListPage cfg={{ title: 'Overseas Agencies', hint: 'Foreign partners that provide employment demands.', resource: 'overseas-agencies', columns: [
      { header: 'Agency', cell: (row: any) => row.name }, { header: 'Country', cell: (row: any) => row.country?.name || '—' }, { header: 'Contact', cell: (row: any) => row.contactName || row.phone || row.email || '—' },
      { header: 'Employer', cell: (row: any) => { const employers = row.employers ?? []; return employers.length ? <span title={employers.map((e: any) => e.employer?.legalName).filter(Boolean).join(', ')}>{employers[0]?.employer?.legalName}{employers.length > 1 ? ` +${employers.length - 1} legacy links` : ''}</span> : <span className="text-muted">Not linked</span>; } },
      { header: 'Active demands', cell: (row: any) => (row.demands ?? []).filter((d: any) => d.active).length }, { header: 'Status', cell: (row: any) => <StatusBadge value={row.active ? 'ACTIVE' : 'INACTIVE'} /> },
    ], rowTo: (row: any) => `/agencies/${row.id}`, rowActions: [
      { label: 'Edit', perm: ['catalogue.manage'], form: (row: any) => ({ title: 'Edit overseas agency', path: `/resource/overseas-agencies/${row.id}`, method: 'PATCH', fields: [
        { name: 'name', label: 'Agency name', required: true }, { name: 'countryId', label: 'Country', type: 'select', required: true, optionsResource: { resource: 'countries', label: (c: any) => c.name } }, { name: 'contactName', label: 'Contact person' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email' }, { name: 'notes', label: 'Notes', type: 'textarea' },
      ] }), initial: (row: any) => row },
      { label: 'Toggle active', kind: 'post', method: 'PATCH', path: (row: any) => `/resource/overseas-agencies/${row.id}`, body: (row: any) => ({ active: !row.active }), perm: ['catalogue.manage'] },
    ], primary: { label: 'Add overseas agency', perm: ['catalogue.manage'], form: { title: 'Add overseas agency', path: '/resource/overseas-agencies', fields: [
      { name: 'name', label: 'Agency name', required: true }, { name: 'countryId', label: 'Country', type: 'select', required: true, optionsResource: { resource: 'countries', label: (row: any) => row.name } }, { name: 'contactName', label: 'Contact person' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email' }, { name: 'notes', label: 'Notes', type: 'textarea' },
    ] } }, empty: { title: 'No overseas agencies yet.' } }} /> : <ListPage cfg={{ title: 'Refer', hint: 'Nepal-side sources who refer applicants to the company.', resource: 'referral-partners', columns: [
      { header: 'Refer', cell: (row: any) => row.name }, { header: 'Contact', cell: (row: any) => row.contact || '—' }, { header: 'Applicants', cell: (row: any) => row._count?.referredCandidates ?? 0 }, { header: 'Active', cell: (row: any) => row.active ? 'Yes' : 'No' },
    ], rowTo: (row: any) => `/refers/${row.id}`, rowActions: [
      { label: 'Edit', perm: ['catalogue.manage'], form: (row: any) => ({ title: 'Edit Refer', path: `/resource/referral-partners/${row.id}`, method: 'PATCH', fields: [{ name: 'name', label: 'Refer name', required: true }, { name: 'contact', label: 'Contact details' }, { name: 'notes', label: 'Notes', type: 'textarea' }] }), initial: (row: any) => row },
      { label: 'Toggle active', method: 'PATCH', path: (row: any) => `/resource/referral-partners/${row.id}`, body: (row: any) => ({ active: !row.active }), perm: ['catalogue.manage'] },
    ], primary: { label: 'Add Refer', perm: ['catalogue.manage'], form: { title: 'Add Refer', path: '/resource/referral-partners', fields: [{ name: 'name', label: 'Refer name', required: true }, { name: 'contact', label: 'Contact details' }, { name: 'notes', label: 'Notes' }] } }, empty: { title: 'No Refer sources have been added yet.' } }} />}
  </div>;
}

function CompanyRelationships({ row, countries, agencies, onSaved }: { row: any; countries: any[]; agencies: any[]; onSaved: () => void }): JSX.Element {
  const [open, setOpen] = useState(false); const [countryIds, setCountryIds] = useState<string[]>(row.destinationCountries?.map((item: any) => item.country.id) ?? []);
  const [agencyIds, setAgencyIds] = useState<string[]>(row.overseasAgencies?.map((item: any) => item.overseasAgency.id) ?? []); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); setError(''); try { await api(`/resource/employers/${row.id}/relationships`, { method: 'PUT', body: { countryIds, overseasAgencyIds: agencyIds } }); setOpen(false); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update company links.'); } finally { setBusy(false); } }
  const checkboxList = (title: string, items: any[], selected: string[], setSelected: (ids: string[]) => void) => <fieldset className="space-y-2"><legend className="title-3">{title}</legend>{items.map((item) => <label key={item.id} className="flex items-center gap-2 body-6"><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.name}</label>)}</fieldset>;
  return <><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Manage links</Button>{open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}><div role="dialog" aria-modal="true" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-bg p-6"><div className="flex items-center justify-between"><h2 className="heading-6">Company relationships</h2><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div><div className="mt-5 grid gap-6 sm:grid-cols-2">{checkboxList('Destination countries', countries, countryIds, setCountryIds)}{checkboxList('Overseas agencies', agencies, agencyIds, setAgencyIds)}</div>{error && <p role="alert" className="body-6 mt-4 text-danger">{error}</p>}<div className="mt-5 flex justify-end"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save links'}</Button></div></div></div>}</>;
}

function CompanyDetail(): JSX.Element {
  const { id = '' } = useParams();
  return <DetailPage cfg={{ resource: 'employers', title: (row) => row.legalName, hint: () => 'Overseas company / employer', fields: [
    { label: 'Registered country', value: (row) => row.registeredCountry?.name || 'None' }, { label: 'Destinations', value: (row) => (row.destinationCountries ?? []).map((link: any) => link.country.name).join(', ') || 'Not set' }, { label: 'Overseas agencies', value: (row) => (row.overseasAgencies ?? []).map((link: any) => link.overseasAgency.name).join(', ') || 'Not set' }, { label: 'Contact', value: (row) => row.contactName || 'None' }, { label: 'Email', value: (row) => row.email || 'None' }, { label: 'Phone', value: (row) => row.phone || 'None' },
  ], tabs: [{ key: 'demands', label: 'Demands', render: () => <ListPage cfg={{ title: 'Company demands', resource: 'demands', fixed: { employerId: id }, columns: [{ header: 'Demand', cell: (row: any) => row.reference }, { header: 'Country', cell: (row: any) => row.destinationCountry?.name }, { header: 'Overseas agency', cell: (row: any) => row.overseasAgency?.name || '—' }], rowTo: (row: any) => `/demands/${row.id}`, empty: { title: 'No demands for this company yet.' } }} /> }] }} />;
}

export function CompaniesPage(): JSX.Element {
  const { can } = useAuth(); const { id } = useParams();
  const [revision, setRevision] = useState(0);
  const countries = useResource<any>('countries', {}, 1, 200).data; const agencies = useResource<any>('overseas-agencies', {}, 1, 200).data;
  if (!can('catalogue.read', 'catalogue.manage')) return <EmptyState title="You do not have access to this page." />;
  if (id) return <CompanyDetail />;
  return <div><PageHeader title="Companies" hint="Manage overseas employers and their agency relationships." />
    <ListPage cfg={{ refreshKey: revision, title: 'Companies', resource: 'employers', columns: [
      { header: 'Company', cell: (row: any) => row.legalName }, { header: 'Registered country', cell: (row: any) => row.registeredCountry?.name || '—' }, { header: 'Destinations', cell: (row: any) => (row.destinationCountries ?? []).map((link: any) => link.country.name).join(', ') || 'Not set' }, { header: 'Overseas agencies', cell: (row: any) => (row.overseasAgencies ?? []).map((link: any) => link.overseasAgency.name).join(', ') || 'Not set' }, { header: 'Contact', cell: (row: any) => row.contactName || row.email || row.phone || '—' }, { header: 'Links', cell: (row: any) => <CompanyRelationships row={row} countries={countries} agencies={agencies} onSaved={() => setRevision((value) => value + 1)} /> },
    ], rowTo: (row: any) => `/companies/${row.id}`, rowActions: [
      { label: 'Edit', perm: ['catalogue.manage'], form: (row: any) => ({ title: 'Edit company', path: `/resource/employers/${row.id}`, method: 'PATCH', fields: [{ name: 'legalName', label: 'Company name', required: true }, { name: 'contactName', label: 'Contact person' }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' }] }), initial: (row: any) => row },
      { label: 'Toggle active', method: 'PATCH', path: (row: any) => `/resource/employers/${row.id}`, body: (row: any) => ({ active: !row.active }), perm: ['catalogue.manage'] },
    ], primary: { label: 'Add company', perm: ['catalogue.manage'], form: { title: 'Add company', path: '/resource/employers', fields: [{ name: 'legalName', label: 'Company name', required: true }, { name: 'registeredCountryId', label: 'Registered country', type: 'select', required: true, optionsResource: { resource: 'countries', label: (row: any) => row.name } }, { name: 'contactName', label: 'Contact person' }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' }] } }, empty: { title: 'No companies have been added yet.' } }} />
  </div>;
}
