import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, SkeletonRows } from '../components/ui';
import { MODULES } from '../lib/modules';
import { useJson } from '../lib/useApi';
import { api } from '../lib/api';

type BusinessMetrics = { activeAgencies: number | null; activeRefers: number | null; activeCompanies: number | null; activeDemands: number | null; countriesByRegion: { region: string | null; count: number }[]; requestedVacancies: number | null; selectedWorkers: number | null; vacanciesRemaining: number | null; pendingPhoto: number | null; pendingPcc: number | null; pendingMedical: number | null };
type Summary = { activeApplications: number | null; pendingApprovals: number | null; businessMetrics?: BusinessMetrics | null };
type LifecycleRow = { status: string; count: number };
type SearchResult = { type: string; title: string; description: string; to: string };
type StatState = { loading: boolean; error: string | null };

const labels: Record<string, string> = {
  ACTIVE: 'Active', ON_HOLD: 'On hold', STOPPED_PENDING_SETTLEMENT: 'Stopped pending settlement',
  CLOSED_SUCCESSFULLY: 'Closed successfully', CLOSED_UNSUCCESSFULLY: 'Closed unsuccessfully',
};
const regionLabel = (region: string | null) => (region === 'EUROPE' ? 'Europe' : region === 'GULF' ? 'Gulf' : 'Unassigned');

export default function HomePage() {
  const { can, me } = useAuth();
  const summary = useJson<Summary>('/analytics/summary');
  const lifecycle = useJson<LifecycleRow[]>(can('application.read') ? '/analytics/lifecycle' : '');
  const [query, setQuery] = useState(''); const [searchResults, setSearchResults] = useState<SearchResult[]>([]); const [searchLoading, setSearchLoading] = useState(false); const [searchError, setSearchError] = useState('');
  const modules = MODULES.filter((m) => m.path && can(...m.anyOf));
  const maxCount = Math.max(1, ...(lifecycle.data ?? []).map((row) => row.count));
  const canSeeApplications = can('application.read');
  const canSeeApprovals = can('catalogue.approve', 'finance.settlement.approve', 'finance.commission.approve');
  const stat: StatState = { loading: summary.loading, error: summary.error };
  const metrics = summary.data?.businessMetrics;
  const showProgress = !!metrics && !stat.loading && !stat.error && metrics.requestedVacancies != null && metrics.selectedWorkers != null && metrics.requestedVacancies > 0;

  useEffect(() => {
    const term = query.trim(); if (term.length < 2) { setSearchResults([]); setSearchError(''); setSearchLoading(false); return; }
    let ignore = false; const timer = window.setTimeout(() => {
      setSearchLoading(true); setSearchError('');
      api<{ data: SearchResult[] }>(`/analytics/search?q=${encodeURIComponent(term)}`).then((result) => { if (!ignore) setSearchResults(result.data ?? []); })
        .catch((e) => { if (!ignore) setSearchError(e instanceof Error ? e.message : 'Search is unavailable.'); })
        .finally(() => { if (!ignore) setSearchLoading(false); });
    }, 250);
    return () => { ignore = true; window.clearTimeout(timer); };
  }, [query]);

  return (
    <div>
      <header className="rise max-w-2xl">
        <h1 className="heading-5">Welcome, {me?.user.fullName}</h1>
        <p className="body-6 mt-2 text-muted">A quick view of recruitment activity and the work available to you.</p>
      </header>

      <section className="mt-8 max-w-3xl" aria-labelledby="quick-search-heading">
        <h2 id="quick-search-heading" className="heading-6">Quick search</h2>
        <p className="body-6 mt-1 text-muted">Type at least two characters to search.</p>
        <div className="relative mt-3">
          <MagnifyingGlass size={20} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="home-search" type="search" aria-labelledby="quick-search-heading" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Applicant, company, agency, demand or job title" className="body-3 w-full rounded-xl border border-line bg-bg py-3 pl-10 pr-3 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg" />
        </div>
        {searchLoading && <p role="status" className="caption-5 mt-3 text-muted">Searching…</p>}
        {searchError && <p role="alert" className="caption-5 mt-3 text-danger">{searchError}</p>}
        {searchResults.length > 0 && <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg" aria-label="Search results">{searchResults.map((result) => <li key={`${result.type}-${result.to}`}>
          <Link to={result.to} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg">
            <span className="min-w-0"><span className="title-4 block">{result.title}</span><span className="caption-5 mt-1 block text-muted">{result.description}</span></span>
            <span className="caption-4 shrink-0 rounded-md bg-surface px-2 py-0.5 text-muted">{result.type}</span>
          </Link></li>)}</ul>}
        {query.trim().length >= 2 && !searchLoading && !searchError && searchResults.length === 0 && <p className="caption-5 mt-3 text-muted">No matching records.</p>}
      </section>

      {(canSeeApplications || canSeeApprovals) && <section className="mt-8" aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="title-2">At a glance</h2>
        <dl className={`mt-4 grid divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface ${canSeeApplications && canSeeApprovals ? 'sm:grid-cols-2 sm:divide-x sm:divide-y-0' : ''}`}>
          {canSeeApplications && <div className="p-6"><dt className="body-5 text-muted">Active applications</dt><dd className="mt-2"><StatValue size="xl" value={summary.data?.activeApplications} {...stat} /></dd></div>}
          {canSeeApprovals && <div className="p-6"><dt className="body-5 text-muted">Pending approvals</dt><dd className="mt-2"><StatValue size="xl" value={summary.data?.pendingApprovals} {...stat} /></dd></div>}
        </dl>
        {summary.error && <div className="mt-3"><ErrorState message={summary.error} retry={summary.reload} /></div>}
      </section>}

      {canSeeApplications && <section className="mt-8" aria-labelledby="lifecycle-heading">
        <div className="flex items-end justify-between gap-4">
          <div><h2 id="lifecycle-heading" className="title-2">Applications by status</h2>
            <p className="body-6 mt-1 text-muted">Application lifecycle, across all recruitment stages.</p></div>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-bg p-5">
          {lifecycle.loading ? <SkeletonRows rows={5} /> : lifecycle.error ? <ErrorState message={lifecycle.error} retry={lifecycle.reload} /> : lifecycle.data?.every((row) => row.count === 0) ? (
            <p className="body-6 py-5 text-center text-muted">No applications have been recorded yet.</p>
          ) : <div className="flex flex-col gap-4" role="list" aria-label="Application counts by lifecycle status">
            {(lifecycle.data ?? []).map((row) => <div key={row.status} role="listitem" className="grid grid-cols-[minmax(9rem,1fr)_3fr_2.5rem] items-center gap-3">
              <span className="body-6">{labels[row.status] ?? row.status}</span>
              <div className="h-3 overflow-hidden rounded-sm bg-surface" role="img" aria-label={`${row.count} ${labels[row.status] ?? row.status} applications`}>
                <div className="h-full rounded-sm bg-primary" style={{ width: `${row.count ? Math.max(3, (row.count / maxCount) * 100) : 0}%` }} />
              </div>
              <span className="title-4 text-right tabular-nums">{row.count}</span>
            </div>)}
          </div>}
        </div>
      </section>}

      {metrics && <section className="mt-10" aria-labelledby="business-metrics-heading">
        <h2 id="business-metrics-heading" className="title-2">Recruitment overview</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-bg">
          <div className="grid divide-y divide-line lg:grid-cols-[3fr_2fr] lg:divide-x lg:divide-y-0">
            <Group title="Demand and workforce">
              <dl className="mt-4 grid grid-cols-3 gap-4">
                <Figure label="Workers requested" value={metrics.requestedVacancies} {...stat} />
                <Figure label="Workers selected" value={metrics.selectedWorkers} {...stat} />
                <Figure label="Vacancies remaining" value={metrics.vacanciesRemaining} {...stat} />
              </dl>
              {showProgress && <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-sm bg-surface" role="img" aria-label={`${metrics.selectedWorkers} of ${metrics.requestedVacancies} requested workers selected`}>
                  <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.min(100, ((metrics.selectedWorkers ?? 0) / (metrics.requestedVacancies ?? 1)) * 100)}%` }} />
                </div>
                <p className="caption-5 mt-2 text-muted">{metrics.selectedWorkers} of {metrics.requestedVacancies} requested workers selected</p>
              </div>}
              <dl className="mt-4 divide-y divide-line border-t border-line">
                <StatRow label="Active demands" value={metrics.activeDemands} {...stat} />
              </dl>
            </Group>
            <Group title="Documentation and readiness">
              <dl className="mt-2 divide-y divide-line">
                <StatRow label="Photo pending" value={metrics.pendingPhoto} {...stat} />
                <StatRow label="PCC pending" value={metrics.pendingPcc} {...stat} />
                <StatRow label="Medical pending" value={metrics.pendingMedical} {...stat} />
              </dl>
            </Group>
          </div>
          <div className="grid divide-y divide-line border-t border-line md:grid-cols-2 md:divide-x md:divide-y-0">
            <Group title="Recruitment network">
              <dl className="mt-2 divide-y divide-line">
                <StatRow label="Overseas agencies" value={metrics.activeAgencies} {...stat} />
                <StatRow label="Refer sources" value={metrics.activeRefers} {...stat} />
                <StatRow label="Companies" value={metrics.activeCompanies} {...stat} />
              </dl>
            </Group>
            <Group title="Geographical coverage">
              {metrics.countriesByRegion.length === 0 ? <p className="body-6 mt-3 text-muted">No countries recorded yet.</p> : <dl className="mt-2 divide-y divide-line">
                {metrics.countriesByRegion.map((row) => <StatRow key={row.region ?? 'unassigned'} label={`${regionLabel(row.region)} countries`} value={row.count} {...stat} />)}
              </dl>}
            </Group>
          </div>
        </div>
      </section>}

      <section className="mt-10" aria-labelledby="workspace-heading">
        <h2 id="workspace-heading" className="title-2">Workspace</h2>
        <p className="body-6 mt-1 text-muted">Modules available to your role.</p>
        {modules.length === 0 ? <div className="mt-4 rounded-xl border border-line p-6"><p className="title-3">No modules are assigned to your role</p><p className="body-6 mt-2 text-muted">Ask an administrator to review your access.</p></div> : (
          <ul className="mt-4 grid md:grid-cols-2 md:gap-x-10">
            {modules.map((m) => <li key={m.key} className="border-b border-line">
              <NavLink to={m.path!} className="-mx-3 flex items-start gap-3 rounded-lg px-3 py-3 transition-colors duration-300 ease-weighted hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
                <m.icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0"><span className="title-4 block">{m.title}</span><span className="body-6 mt-1 block text-muted">{m.description}</span></span>
              </NavLink>
            </li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

const sizes = {
  xl: { text: 'heading-3', skeleton: 'h-9 w-20' },
  lg: { text: 'heading-5', skeleton: 'h-8 w-14' },
  sm: { text: 'title-4', skeleton: 'h-5 w-8' },
} as const;

/** One real number. Loading shows a placeholder, an error shows "Unavailable", a missing value shows a dash. A real zero shows 0. */
function StatValue({ size, value, loading, error }: StatState & { size: keyof typeof sizes; value?: number | null }) {
  if (loading) return <><span aria-hidden="true" className={`block animate-pulse rounded bg-line ${sizes[size].skeleton}`} /><span className="sr-only">Loading</span></>;
  if (error) return <span className="body-6 text-muted">Unavailable</span>;
  return <span className={`tabular-nums ${sizes[size].text}`}>{value ?? '—'}</span>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="min-w-0 p-6"><h3 id={id} className="caption-3 text-muted">{title}</h3>{children}</section>;
}

function Figure({ label, value, loading, error }: StatState & { label: string; value?: number | null }) {
  return <div className="min-w-0"><dt className="caption-5 text-muted">{label}</dt><dd className="mt-1"><StatValue size="lg" value={value} loading={loading} error={error} /></dd></div>;
}

function StatRow({ label, value, loading, error }: StatState & { label: string; value?: number | null }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className="body-6 text-muted">{label}</dt><dd><StatValue size="sm" value={value} loading={loading} error={error} /></dd></div>;
}