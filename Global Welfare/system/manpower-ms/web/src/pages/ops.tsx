import { useState, type JSX, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BoardPage, DetailPage, ListPage } from '../components/engines';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, Money, PageHeader, SkeletonRows, StatusBadge } from '../components/ui';
import { useJson } from '../lib/useApi';

const LIFECYCLE = ['ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT', 'CLOSED_SUCCESSFULLY', 'CLOSED_UNSUCCESSFULLY'];
const MANUAL_LIFECYCLE = ['ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT'];

function AccessDenied(): JSX.Element {
  return <EmptyState title="You do not have access to this page." hint="Ask an administrator if you need access." />;
}

function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (key: string) => void }): JSX.Element {
  return (
    <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-2 border-b border-line pb-2">
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

export function CandidatesPage(): JSX.Element {
  const { can } = useAuth();
  if (!can('candidate.read', 'candidate.create')) return <AccessDenied />;
  return (
    <ListPage
      cfg={{
        title: 'Candidates',
        hint: 'Register people and track their applications.',
        resource: 'candidates',
        columns: [
          { header: 'Candidate', cell: (r: any) => r.fullName },
          { header: 'Code', cell: (r: any) => r.candidateCode },
          { header: 'Phone', cell: (r: any) => r.phone || 'None' },
          { header: 'Applications', cell: (r: any) => r.applications?.length ?? 0 },
        ],
        rowTo: (r: any) => `/candidates/${r.id}`,
        primary: can('candidate.create') && can('application.create') ? { label: 'New intake', to: '/intake' } : undefined,
        empty: { title: 'No candidates yet.' },
      }}
    />
  );
}

export function CandidateDetailPage(): JSX.Element {
  const { can } = useAuth();
  const { id } = useParams();
  if (!can('candidate.read', 'candidate.create')) return <AccessDenied />;
  return (
    <DetailPage
      cfg={{
        resource: 'candidates',
        title: (r: any) => r.fullName,
        fields: [
          { label: 'Code', value: (r: any) => r.candidateCode },
          { label: 'Phone', value: (r: any) => r.phone || 'None' },
          { label: 'Email', value: (r: any) => r.email || 'None' },
          { label: 'Address', value: (r: any) => r.address || 'None' },
          { label: 'Date of birth', value: (r: any) => r.dateOfBirth ? String(r.dateOfBirth).slice(0, 10) : 'None' },
        ],
        tabs: [
          {
            key: 'applications',
            label: 'Applications',
            render: () => (
              <ListPage
                cfg={{
                  title: 'Applications',
                  resource: 'applications',
                  fixed: { candidateId: id ?? '' },
                  embedded: true,
                  columns: [
                    { header: 'Code', cell: (r: any) => r.code },
                    { header: 'Position', cell: (r: any) => r.position?.jobTitle?.title || 'None' },
                    { header: 'Lifecycle', cell: (r: any) => <StatusBadge value={r.lifecycleStatus} /> },
                    { header: 'Agreed amount', cell: (r: any) => <Money amount={r.agreedAmountSnapshot} currency={r.currency} /> },
                  ],
                  rowTo: (r: any) => `/applications/${r.id}`,
                  empty: { title: 'No applications for this candidate.' },
                }}
              />
            ),
          },
          { key: 'passports', label: 'Passports', render: () => <CandidatePassports id={id ?? ''} /> },
        ],
      }}
    />
  );
}

export function ApplicationsPage(): JSX.Element {
  const { can } = useAuth();
  if (!can('application.read')) return <AccessDenied />;
  return (
    <BoardPage
      cfg={{
        title: 'Applications',
        hint: 'Track application progress by lifecycle status.',
        resource: 'applications',
        statusField: 'lifecycleStatus',
        columns: LIFECYCLE.map((status) => ({ status, label: status.replaceAll('_', ' ') })),
        card: (r: any) => ({
          title: r.code,
          meta: r.candidate?.fullName,
          tags: [r.position?.jobTitle?.title, r.currency].filter(Boolean),
        }),
        to: (r: any) => `/applications/${r.id}`,
        moves: MANUAL_LIFECYCLE.map((status) => ({
          label: status.replaceAll('_', ' '),
          status,
          path: (r: any) => `/resource/applications/${r.id}/status`,
          perm: ['application.update'],
          when: (r: any) => r.lifecycleStatus !== status,
        })),
        primary: can('candidate.create') && can('application.create') ? { label: 'New intake', to: '/intake' } : undefined,
        empty: { title: 'No applications yet.' },
      }}
    />
  );
}

export function ApplicationDetailPage(): JSX.Element {
  const { can } = useAuth();
  const { id } = useParams();
  if (!can('application.read')) return <AccessDenied />;
  return (
    <DetailPage
      cfg={{
        resource: 'applications',
        title: (r: any) => r.code,
        fields: [
          { label: 'Candidate', value: (r: any) => r.candidate?.fullName || 'None' },
          { label: 'Position', value: (r: any) => r.position?.jobTitle?.title || 'None' },
          { label: 'Source', value: (r: any) => r.sourceType },
          { label: 'Lifecycle', value: (r: any) => <StatusBadge value={r.lifecycleStatus} /> },
          { label: 'Agreed amount', value: (r: any) => <Money amount={r.agreedAmountSnapshot} currency={r.currency} /> },
          { label: 'Package total', value: (r: any) => <Money amount={r.packageTotalSnapshot} currency={r.currency} /> },
          { label: 'Opened', value: (r: any) => r.openedAt ? String(r.openedAt).slice(0, 10) : 'None' },
        ],
        primary: {
          label: 'Change status',
          perm: ['application.update'],
          form: {
            title: 'Change status',
            path: `/resource/applications/${id}/status`,
            fields: [
              { name: 'status', label: 'Status', type: 'select', required: true, options: MANUAL_LIFECYCLE.map((v) => ({ value: v, label: v })) },
              { name: 'reason', label: 'Reason', type: 'textarea', required: true },
            ],
          },
        },
        tabs: [
          { key: 'finance', label: 'Finance', render: () => <ApplicationFinance id={id ?? ''} /> },
          {
            key: 'payments',
            label: 'Payments',
            render: () => (
              <ListPage
                cfg={{
                  title: 'Payments',
                  resource: 'candidate-payments',
                  fixed: { applicationId: id ?? '' },
                  embedded: true,
                  columns: [
                    { header: 'Received', cell: (r: any) => String(r.receivedOn).slice(0, 10) },
                    { header: 'Amount', cell: (r: any) => <Money amount={r.amount} currency={r.currency} /> },
                    { header: 'Method', cell: (r: any) => r.method },
                    { header: 'Receipt', cell: (r: any) => r.receiptNumber },
                  ],
                  empty: { title: 'No payments yet.' },
                }}
              />
            ),
          },
          {
            key: 'installments',
            label: 'Installments',
            render: () => (
              <ListPage
                cfg={{
                  title: 'Installments',
                  resource: 'installments',
                  fixed: { applicationId: id ?? '' },
                  embedded: true,
                  columns: [
                    { header: 'Seq', cell: (r: any) => r.seq },
                    { header: 'Label', cell: (r: any) => r.label },
                    { header: 'Expected', cell: (r: any) => <Money amount={r.expectedAmount} currency={r.application?.currency ?? 'NPR'} /> },
                    { header: 'Due', cell: (r: any) => r.dueOn ? String(r.dueOn).slice(0, 10) : 'None' },
                  ],
                  empty: { title: 'No installments yet.' },
                }}
              />
            ),
          },
          {
            key: 'history',
            label: 'Status history',
            render: () => (
              <ListPage
                cfg={{
                  title: 'Status history',
                  resource: 'status-history',
                  fixed: { applicationId: id ?? '' },
                  embedded: true,
                  columns: [
                    { header: 'From', cell: (r: any) => r.fromStatus ? <StatusBadge value={r.fromStatus} /> : 'None' },
                    { header: 'To', cell: (r: any) => <StatusBadge value={r.toStatus} /> },
                    { header: 'Reason', cell: (r: any) => r.reason || 'None' },
                    { header: 'Changed', cell: (r: any) => String(r.changedAt).slice(0, 10) },
                  ],
                  empty: { title: 'No status history yet.' },
                }}
              />
            ),
          },
          {
            key: 'settlements',
            label: 'Settlements',
            render: () => (
              <ListPage
                cfg={{
                  title: 'Settlements',
                  resource: 'settlements',
                  fixed: { applicationId: id ?? '' },
                  embedded: true,
                  columns: [
                    { header: 'Revision', cell: (r: any) => r.revisionNo },
                    { header: 'Status', cell: (r: any) => <StatusBadge value={r.status} /> },
                    { header: 'Refund due', cell: (r: any) => <Money amount={r.refundDue} currency={r.currency} /> },
                    { header: 'Reason', cell: (r: any) => r.stopReason },
                  ],
                  empty: { title: 'No settlements yet.' },
                }}
              />
            ),
          },
        ],
      }}
    />
  );
}

function CandidatePassports({ id }: { id: string }): JSX.Element {
  const { data, loading, error, reload } = useJson<any[]>(`/intake/candidates/${id}/passports`);
  if (loading) return <SkeletonRows />;
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data?.length) return <EmptyState title="No passports on file." hint="Add a passport to release no-passport holds." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[24rem] border-collapse text-left">
          <thead className="bg-surface"><tr>{['Status', 'Current', 'Issue', 'Expiry'].map((h) => <th key={h} scope="col" className="caption-4 p-3">{h}</th>)}</tr></thead>
          <tbody>
            {data.map((r: any) => (
              <tr key={r.id} className="border-t border-line">
                <td className="body-6 p-3"><StatusBadge value={r.status} /></td>
                <td className="body-6 p-3">{r.isCurrent ? 'Yes' : 'No'}</td>
                <td className="body-6 p-3">{String(r.issueDate).slice(0, 10)}</td>
                <td className="body-6 p-3">{String(r.expiryDate).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApplicationFinance({ id }: { id: string }): JSX.Element {
  const { data, loading, error, reload } = useJson<any[]>(`/finance/application/${id}`);
  if (loading) return <SkeletonRows />;
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data?.length) return <EmptyState title="No finance data yet." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead className="bg-surface">
            <tr>
              {['Currency', 'Agreed', 'Collected', 'Outstanding', 'Refunds paid', 'Retention approved', 'Settlement balance'].map((h) => (
                <th key={h} scope="col" className="caption-4 p-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any) => (
              <tr key={row.currency} className="border-t border-line">
                <td className="body-6 p-3">{row.currency}</td>
                <td className="body-6 p-3"><Money amount={row.agreedAmount} currency={row.currency} /></td>
                <td className="body-6 p-3"><Money amount={row.collected} currency={row.currency} /></td>
                <td className="body-6 p-3"><Money amount={row.outstanding} currency={row.currency} /></td>
                <td className="body-6 p-3"><Money amount={row.refundsPaid} currency={row.currency} /></td>
                <td className="body-6 p-3"><Money amount={row.retentionApproved} currency={row.currency} /></td>
                <td className="body-6 p-3"><Money amount={row.settlementBalance} currency={row.currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FinancePage(): JSX.Element {
  const { can } = useAuth();
  const [tab, setTab] = useState('receipts');
  if (!can('finance.receipt.read', 'finance.expense.read', 'finance.commission.manage', 'finance.settlement.prepare')) return <AccessDenied />;
  const tabs = [
    { key: 'receipts', label: 'Receipts', perm: ['finance.receipt.read'] },
    { key: 'expenses', label: 'Expenses', perm: ['finance.expense.read'] },
    { key: 'commissions', label: 'Commissions', perm: ['finance.commission.manage', 'finance.commission.approve'] },
    { key: 'settlements', label: 'Settlements', perm: ['finance.settlement.prepare'] },
    { key: 'refunds', label: 'Refunds', perm: ['finance.settlement.prepare'] },
    { key: 'installments', label: 'Installments', perm: ['finance.receipt.read'] },
    { key: 'expense-categories', label: 'Expense categories', perm: ['catalogue.read'] },
  ].filter((t) => can(...t.perm));
  const active = tabs.find((t) => t.key === tab)?.key ?? tabs[0]?.key ?? '';
  return (
    <div>
      <PageHeader title="Finance" hint="Receipts, expenses, commissions, settlements, and refunds." />
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      <TabPanel label={tabs.find((t) => t.key === active)?.label ?? ''}>
        {active === 'receipts' && (
          <ListPage
            cfg={{
              title: 'Receipts',
              resource: 'candidate-payments',
              embedded: true,
              columns: [
                { header: 'Application', cell: (r: any) => r.application?.code || 'None' },
                { header: 'Amount', cell: (r: any) => <Money amount={r.amount} currency={r.currency} /> },
                { header: 'Received', cell: (r: any) => String(r.receivedOn).slice(0, 10) },
                { header: 'Method', cell: (r: any) => r.method },
                { header: 'Receipt', cell: (r: any) => r.receiptNumber },
              ],
              primary: {
                label: 'New receipt',
                perm: ['finance.receipt.record'],
                form: {
                  title: 'New receipt',
                  path: '/resource/candidate-payments',
                  fields: [
                    { name: 'applicationId', label: 'Application', required: true, optionsResource: { resource: 'applications', label: (r: any) => r.code } },
                    { name: 'amount', label: 'Amount', type: 'number', required: true },
                    { name: 'currency', label: 'Currency', required: true },
                    { name: 'receivedOn', label: 'Received on', type: 'date', required: true },
                    { name: 'method', label: 'Method', required: true },
                    { name: 'receiptNumber', label: 'Receipt number', required: true },
                    { name: 'payerName', label: 'Payer name', required: true },
                  ],
                },
              },
              rowActions: [
                { label: 'Reverse', kind: 'post', path: (r: any) => `/resource/candidate-payments/${r.id}/reverse`, reason: true, perm: ['finance.receipt.record'], confirmTitle: 'Reverse this receipt?' },
              ],
              empty: { title: 'No receipts yet.' },
            }}
          />
        )}
        {active === 'expenses' && (
          <ListPage
            cfg={{
              title: 'Expenses',
              resource: 'expenses',
              embedded: true,
              columns: [
                { header: 'Date', cell: (r: any) => String(r.expenseDate).slice(0, 10) },
                { header: 'Category', cell: (r: any) => r.category?.name || 'None' },
                { header: 'Payee', cell: (r: any) => r.payee },
                { header: 'Amount', cell: (r: any) => <Money amount={r.amount} currency={r.currency} /> },
              ],
              primary: {
                label: 'New expense',
                perm: ['finance.expense.record'],
                form: {
                  title: 'New expense',
                  path: '/resource/expenses',
                  fields: [
                    { name: 'categoryId', label: 'Category', required: true, optionsResource: { resource: 'expense-categories', label: (r: any) => r.name } },
                    { name: 'expenseDate', label: 'Expense date', type: 'date', required: true },
                    { name: 'amount', label: 'Amount', type: 'number', required: true },
                    { name: 'currency', label: 'Currency', required: true },
                    { name: 'payee', label: 'Payee', required: true },
                    { name: 'paymentMethod', label: 'Payment method', required: true },
                    { name: 'description', label: 'Description', type: 'textarea', required: true },
                  ],
                },
              },
              rowActions: [
                { label: 'Reverse', kind: 'post', path: (r: any) => `/resource/expenses/${r.id}/reverse`, reason: true, perm: ['finance.expense.record'], confirmTitle: 'Reverse this expense?' },
              ],
              empty: { title: 'No expenses yet.' },
            }}
          />
        )}
        {active === 'commissions' && (
          <ListPage
            cfg={{
              title: 'Commissions',
              resource: 'commissions',
              embedded: true,
              columns: [
                { header: 'Application', cell: (r: any) => r.application?.code || 'None' },
                { header: 'Partner', cell: (r: any) => r.partner?.name || 'None' },
                { header: 'Amount', cell: (r: any) => <Money amount={r.agreedAmount} currency={r.currency} /> },
                { header: 'Status', cell: (r: any) => <StatusBadge value={r.approvalStatus} /> },
              ],
              empty: { title: 'No commissions yet.' },
            }}
          />
        )}
        {active === 'settlements' && (
          <ListPage
            cfg={{
              title: 'Settlements',
              resource: 'settlements',
              embedded: true,
              columns: [
                { header: 'Application', cell: (r: any) => r.application?.code || 'None' },
                { header: 'Revision', cell: (r: any) => r.revisionNo },
                { header: 'Status', cell: (r: any) => <StatusBadge value={r.status} /> },
                { header: 'Refund due', cell: (r: any) => <Money amount={r.refundDue} currency={r.currency} /> },
              ],
              empty: { title: 'No settlements yet.' },
            }}
          />
        )}
        {active === 'refunds' && (
          <ListPage
            cfg={{
              title: 'Refunds',
              resource: 'refunds',
              embedded: true,
              columns: [
                { header: 'Settlement', cell: (r: any) => r.settlement ? `#${r.settlement.revisionNo}` : 'None' },
                { header: 'Amount', cell: (r: any) => <Money amount={r.amount} currency={r.currency} /> },
                { header: 'Paid on', cell: (r: any) => String(r.paidOn).slice(0, 10) },
                { header: 'Method', cell: (r: any) => r.method },
              ],
              rowActions: [
                { label: 'Reverse', kind: 'post', path: (r: any) => `/resource/refunds/${r.id}/reverse`, reason: true, perm: ['finance.settlement.prepare'], confirmTitle: 'Reverse this refund?' },
              ],
              empty: { title: 'No refunds yet.' },
            }}
          />
        )}
        {active === 'installments' && (
          <ListPage
            cfg={{
              title: 'Installments',
              resource: 'installments',
              embedded: true,
              columns: [
                { header: 'Application', cell: (r: any) => r.application?.code || 'None' },
                { header: 'Seq', cell: (r: any) => r.seq },
                { header: 'Label', cell: (r: any) => r.label },
                { header: 'Expected', cell: (r: any) => <Money amount={r.expectedAmount} currency={r.application?.currency ?? 'NPR'} /> },
              ],
              empty: { title: 'No installments yet.' },
            }}
          />
        )}
        {active === 'expense-categories' && (
          <ListPage
            cfg={{
              title: 'Expense categories',
              resource: 'expense-categories',
              embedded: true,
              columns: [
                { header: 'Name', cell: (r: any) => r.name },
                { header: 'Parent', cell: (r: any) => r.parent?.name || 'None' },
                { header: 'Active', cell: (r: any) => r.active ? 'Yes' : 'No' },
              ],
              empty: { title: 'No expense categories yet.' },
            }}
          />
        )}
      </TabPanel>
    </div>
  );
}

export function ApprovalsPage(): JSX.Element {
  const { can } = useAuth();
  if (!can('application.read', 'catalogue.approve', 'finance.settlement.approve', 'finance.commission.approve')) return <AccessDenied />;
  return (
    <ListPage
      cfg={{
        title: 'Approvals',
        hint: 'Review pending approval requests.',
        resource: 'approval-actions',
        fixed: { decision: 'PENDING' },
        columns: [
          { header: 'Entity type', cell: (r: any) => r.entityType },
          { header: 'Entity', cell: (r: any) => r.entityId },
          { header: 'Requested', cell: (r: any) => String(r.requestedAt).slice(0, 10) },
          { header: 'Action', cell: (r: any) => r.action },
        ],
        rowActions: [
          { label: 'Approve', kind: 'post', path: (r: any) => `/resource/approval-actions/${r.id}/decision`, body: () => ({ decision: 'APPROVED' }), reason: true, perm: ['finance.settlement.approve', 'finance.commission.approve', 'catalogue.approve'], confirmTitle: 'Approve this request?' },
          { label: 'Reject', kind: 'post', path: (r: any) => `/resource/approval-actions/${r.id}/decision`, body: () => ({ decision: 'REJECTED' }), reason: true, perm: ['finance.settlement.approve', 'finance.commission.approve', 'catalogue.approve'], confirmTitle: 'Reject this request?' },
        ],
        empty: { title: 'No approvals are waiting.' },
      }}
    />
  );
}

export function UsersPage(): JSX.Element {
  const { can } = useAuth();
  if (!can('admin.users.manage')) return <AccessDenied />;
  return (
    <ListPage
      cfg={{
        title: 'Users',
        hint: 'Manage user accounts and access.',
        resource: 'users',
        columns: [
          { header: 'Name', cell: (r: any) => r.fullName },
          { header: 'Email', cell: (r: any) => r.email },
          { header: 'Status', cell: (r: any) => <StatusBadge value={r.status} /> },
          { header: 'Last sign in', cell: (r: any) => r.lastLoginAt ? String(r.lastLoginAt).slice(0, 10) : 'None' },
        ],
        primary: {
          label: 'New user',
          perm: ['admin.users.manage'],
          form: {
            title: 'New user',
            path: '/resource/users',
            fields: [
              { name: 'email', label: 'Email', required: true },
              { name: 'fullName', label: 'Full name', required: true },
              { name: 'password', label: 'Password', type: 'password', required: true },
              { name: 'status', label: 'Status', type: 'select', required: true, options: ['ACTIVE', 'DISABLED'].map((v) => ({ value: v, label: v })) },
              { name: 'roles', label: 'Roles', placeholder: 'Comma separated role codes', help: 'Example: CEO, TECH_ADMIN' },
            ],
          },
        },
        empty: { title: 'No user accounts yet.' },
      }}
    />
  );
}

export function AuditPage(): JSX.Element {
  const { can } = useAuth();
  if (!can('audit.read')) return <AccessDenied />;
  return (
    <ListPage
      cfg={{
        title: 'Audit log',
        hint: 'Recorded system activity.',
        resource: 'audit-logs',
        columns: [
          { header: 'When', cell: (r: any) => r.at ? String(r.at).replace('T', ' ').slice(0, 16) : 'None' },
          { header: 'Actor', cell: (r: any) => r.actorUserId || 'None' },
          { header: 'Action', cell: (r: any) => r.action },
          { header: 'Entity', cell: (r: any) => r.entityType || 'None' },
        ],
        empty: { title: 'No audit events yet.' },
      }}
    />
  );
}
