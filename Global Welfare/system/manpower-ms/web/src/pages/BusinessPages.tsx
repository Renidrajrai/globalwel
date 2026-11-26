import { useState, type JSX } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { DetailPage, ListPage } from '../components/engines';
import { EmptyState, ErrorState, FormDialog, PageHeader, SkeletonRows } from '../components/ui';
import { api } from '../lib/api';
import { useResource } from '../lib/useApi';

const regionOptions = [{ value: 'EUROPE', label: 'Europe' }, { value: 'GULF', label: 'Gulf' }];
const countryForm = {
  title: 'Add country', path: '/resource/countries', fields: [
    { name: 'name', label: 'Country name', required: true },
    { name: 'region', label: 'Region (optional)', type: 'select' as const, options: regionOptions },
  ],
};
const countryEditForm = {
  title: 'Edit country', path: '', method: 'PATCH' as const, fields: [
    { name: 'name', label: 'Country name', required: true },
  ],
};

function CountryCard({ row, canManage, move, reload, mutate }: { row: any; canManage: boolean; move: (id: string, region: string | null, beforeId?: string) => Promise<void>; reload: () => void; mutate: (id: string, patch: any) => void }): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  return <article draggable={canManage} onDragStart={(e) => { e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id && id !== row.id) void move(id, row.region ?? null, row.id); }} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg p-4">
    <div className="min-w-0"><p className="title-3">{row.name}</p><p className="caption-5 mt-1 text-muted">{row.iso3Code ?? row.iso2Code} · {row.active ? 'Active' : 'Inactive'}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      {canManage && <label className="caption-5 flex items-center gap-2">Move to <select aria-label={`Move ${row.name} to a region`} className="body-6 rounded-lg border border-line bg-bg px-2 py-1" value={row.region ?? ''} onChange={(e) => void move(row.id, e.target.value || null)}><option value="">Unassigned</option>{regionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      {canManage && <><Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { const result = await api<{ data: any }>(`/resource/countries/${row.id}`, { method: 'PATCH', body: { active: !row.active } }); mutate(row.id, { active: result.data.active }); } catch { reload(); } finally { setBusy(false); } }}>{row.active ? 'Deactivate' : 'Activate'}</Button></>}
    </div>
    {editing && <FormDialog open form={{ ...countryEditForm, path: `/resource/countries/${row.id}` }} initial={{ name: row.name }} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
  </article>;
}

export function CountriesPage(): JSX.Element {
  const { can } = useAuth();
  const canRead = can('catalogue.read', 'catalogue.manage'); const canManage = can('catalogue.manage');
  const { data, loading, error, reload, mutate, setData } = useResource<any>('countries', {}, 1, 200);
  const [addOpen, setAddOpen] = useState(false); const [query, setQuery] = useState(''); const [moveError, setMoveError] = useState('');
  if (!canRead) return <EmptyState title="You do not have access to this page." hint="Ask an administrator if you need access." />;
  const visible = data.filter((row) => !query.trim() || `${row.name} ${row.iso3Code}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function move(id: string, region: string | null, beforeId?: string) {
    const row = data.find((item) => item.id === id); if (!row || !canManage) return;
    const target = data.filter((item) => (item.region ?? null) === region && item.id !== id).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    const at = beforeId ? target.findIndex((item) => item.id === beforeId) : -1;
    target.splice(at < 0 ? target.length : at, 0, { ...row, region });
    const previous = data; const orderedIds = target.map((item) => item.id); const next = data.map((item) => { const index = orderedIds.indexOf(item.id); return index < 0 ? item : { ...item, region, displayOrder: (index + 1) * 10 }; });
    setData(next);
    try { await api('/resource/countries/reorder', { method: 'POST', body: { region, orderedIds } }); setMoveError(''); }
    catch (e) { setData(previous); setMoveError(e instanceof Error ? e.message : 'Could not save the country order.'); }
  }
  return <div>
    <PageHeader title="Countries" hint="Group destination countries under Europe or Gulf. Drag to reorder, or use Move to for keyboard and touch." actions={canManage ? <Button onClick={() => setAddOpen(true)}>Add country</Button> : undefined} />
    <div className="mb-5 flex flex-wrap gap-3"><input type="search" aria-label="Search countries" placeholder="Search countries" value={query} onChange={(e) => setQuery(e.target.value)} className="body-3 w-full max-w-xs rounded-lg border border-line bg-bg px-3 py-2" /></div>
    {moveError && <p role="alert" className="body-6 mb-3 text-danger">{moveError}</p>}
    {loading ? <SkeletonRows rows={7} /> : error ? <ErrorState message={error} retry={reload} /> : visible.length === 0 ? <EmptyState title="No countries match this search." hint="Add a country or clear the filters." /> : <div className="space-y-6">
      {[['EUROPE', 'Europe'], ['GULF', 'Gulf'], ['', 'Unassigned']].map(([code, title]) => {
        const rows = visible.filter((row) => (row.region ?? '') === code).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
        return <section key={code || 'unassigned'} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) void move(id, code || null); }} aria-label={`${title} countries`} className="rounded-xl border border-line p-4">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="title-2">{title}</h2><span className="caption-5 text-muted">{rows.length}</span></div>
          {rows.length ? <div className="space-y-2">{rows.map((row) => <CountryCard key={row.id} row={row} canManage={canManage} move={move} reload={reload} mutate={mutate} />)}</div> : <p className="body-6 py-3 text-muted">Drop countries here or move one using its menu.</p>}
        </section>;
      })}
    </div>}
    {addOpen && <FormDialog open form={countryForm} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); reload(); }} />}
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
      { header: 'Companies', cell: (row: any) => row.employers?.length ?? 0 }, { header: 'Active', cell: (row: any) => row.active ? 'Yes' : 'No' },
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
