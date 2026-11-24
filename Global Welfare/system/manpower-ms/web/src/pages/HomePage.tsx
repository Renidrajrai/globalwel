import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, SkeletonRows } from '../components/ui';
import { MODULES } from '../lib/modules';
import { useJson } from '../lib/useApi';

type Summary = { activeApplications: number | null; pendingApprovals: number | null };
type LifecycleRow = { status: string; count: number };
const labels: Record<string, string> = {
  ACTIVE: 'Active', ON_HOLD: 'On hold', STOPPED_PENDING_SETTLEMENT: 'Stopped pending settlement',
  CLOSED_SUCCESSFULLY: 'Closed successfully', CLOSED_UNSUCCESSFULLY: 'Closed unsuccessfully',
};

export default function HomePage() {
  const { can, me } = useAuth();
  const summary = useJson<Summary>('/analytics/summary');
  const lifecycle = useJson<LifecycleRow[]>(can('application.read') ? '/analytics/lifecycle' : '');
  const modules = MODULES.filter((m) => m.path && can(...m.anyOf));
  const maxCount = Math.max(1, ...(lifecycle.data ?? []).map((row) => row.count));

  return (
    <div>
      <header className="rise max-w-2xl">
        <h1 className="heading-5">Welcome, {me?.user.fullName}</h1>
        <p className="body-6 mt-2 text-muted">A quick view of recruitment activity and the work available to you.</p>
      </header>

      {can('application.read') && <section className="mt-8" aria-labelledby="lifecycle-heading">
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

      {(can('application.read') || can('catalogue.approve', 'finance.settlement.approve', 'finance.commission.approve')) && <section className="mt-8" aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="title-2">At a glance</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {can('application.read') && <Metric label="Active applications" value={summary.data?.activeApplications} loading={summary.loading} error={summary.error} />}
          {can('catalogue.approve', 'finance.settlement.approve', 'finance.commission.approve') && <Metric label="Pending approvals" value={summary.data?.pendingApprovals} loading={summary.loading} error={summary.error} />}
        </div>
        {summary.error && <div className="mt-3"><ErrorState message={summary.error} retry={summary.reload} /></div>}
      </section>}

      <section className="mt-10" aria-labelledby="go-to-heading">
        <h2 id="go-to-heading" className="title-2">Go to</h2>
        {modules.length === 0 ? <div className="mt-4 rounded-xl border border-line p-6"><p className="title-3">No modules are assigned to your role</p><p className="body-6 mt-2 text-muted">Ask an administrator to review your access.</p></div> : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {modules.map((m) => <li key={m.key}><NavLink to={m.path!} className="flex items-start gap-3 rounded-xl border border-line p-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
              <m.icon size={20} /><span className="min-w-0"><span className="title-4 block">{m.title}</span><span className="body-6 mt-1 block text-muted">{m.description}</span></span>
            </NavLink></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, loading, error }: { label: string; value?: number | null; loading: boolean; error: string | null }) {
  return <div className="rounded-xl border border-line p-4"><p className="caption-5 text-muted">{label}</p>
    {loading ? <div className="mt-2 h-8 animate-pulse rounded bg-surface" /> : error ? <p className="body-6 mt-2 text-muted">Unavailable</p> : <p className="heading-6 mt-1 tabular-nums">{value ?? '—'}</p>}
  </div>;
}
