import { useState, type JSX, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { postJson, useOne, useResource } from '../lib/useApi';
import { Button } from './Button';
import { Field } from './Field';
import { EmptyState, ErrorState, FormDialog, PageHeader, ReasonDialog, SkeletonRows } from './ui';
import type { FormDef } from './ui';

export type Col<T> = { header: string; cell: (row: T) => ReactNode; perm?: string[] };
export type FilterDef = { key: string; label: string; type?: 'search' | 'select' | 'date'; options?: { value: string; label: string }[] };
export type RowAction<T> = {
  label: string;
  kind?: 'navigate' | 'post';
  path?: (row: T) => string;
  to?: (row: T) => string;
  method?: 'POST' | 'PATCH';
  body?: (row: T) => Record<string, unknown>;
  perm?: string[];
  when?: (row: T) => boolean;
  confirmTitle?: string;
  reason?: boolean;
};
export type ListCfg<T> = {
  title: string;
  hint?: string;
  resource: string;
  columns: Col<T>[];
  filters?: FilterDef[];
  fixed?: Record<string, string>;
  primary?: { label: string; perm?: string[]; form?: FormDef; to?: string };
  rowTo?: (row: T) => string;
  rowActions?: RowAction<T>[];
  empty: { title: string; hint?: string };
  embedded?: boolean;
  pageSize?: number;
};

const controlClass =
  'body-3 w-full rounded-lg border border-line bg-bg px-3 py-2 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg';

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.';
}

export function ListPage<T extends { id: string }>({ cfg }: { cfg: ListCfg<T> }): JSX.Element {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [reasonTarget, setReasonTarget] = useState<{ action: RowAction<T>; row: T } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const params: Record<string, string | number | boolean | undefined> = { ...cfg.fixed, ...filters };
  if (q.trim()) params.q = q.trim();
  const pageSize = cfg.pageSize ?? 20;
  const { data, total, loading, error, reload } = useResource<T>(cfg.resource, params, page, pageSize);
  const columns = cfg.columns.filter((col) => !col.perm || can(...col.perm));
  const actions = (cfg.rowActions ?? []).filter((action) => !action.perm || can(...action.perm));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const primary = cfg.primary && (!cfg.primary.perm || can(...cfg.primary.perm)) ? cfg.primary : null;
  const rowTo = cfg.rowTo;

  async function runAction(action: RowAction<T>, row: T, reason?: string) {
    setActionError(null);
    if (action.kind === 'navigate') {
      if (action.to) navigate(action.to(row));
      return;
    }
    if (action.reason && reason === undefined) {
      setReasonTarget({ action, row });
      return;
    }
    if (action.confirmTitle && !window.confirm(action.confirmTitle ?? action.label)) return;
    const body = action.body?.(row) ?? {};
    try {
      await postJson(action.path?.(row) ?? '', reason === undefined ? body : { ...body, reason }, action.method ?? 'POST');
      reload();
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  return (
    <div className="min-w-0">
      {!cfg.embedded && (
        <PageHeader
          title={cfg.title}
          hint={cfg.hint}
          actions={
            primary && (
              <Button
                onClick={() => {
                  if (primary.form) setFormOpen(true);
                  else if (primary.to) navigate(primary.to);
                }}
              >
                {primary.label}
              </Button>
            )
          }
        />
      )}
      {actionError && (
        <p role="alert" className="body-6 mt-2 text-danger">
          {actionError}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <Field
            id="list-q"
            label="Search"
            type="search"
            placeholder="Search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {cfg.filters?.map((filter) => (
          <div key={filter.key} className="w-full sm:w-48">
            {filter.type === 'select' ? (
              <>
                <label htmlFor={'filter-' + filter.key} className="title-4">
                  {filter.label}
                </label>
                <select
                  id={'filter-' + filter.key}
                  value={filters[filter.key] ?? ''}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, [filter.key]: e.target.value }));
                    setPage(1);
                  }}
                  className={controlClass}
                >
                  <option value="">All</option>
                  {filter.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <Field
                id={'filter-' + filter.key}
                label={filter.label}
                type={filter.type === 'date' ? 'date' : 'text'}
                value={filters[filter.key] ?? ''}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, [filter.key]: e.target.value }));
                  setPage(1);
                }}
              />
            )}
          </div>
        ))}
        {cfg.embedded && primary?.form && <div className="ml-auto"><Button onClick={() => setFormOpen(true)}>{primary.label}</Button></div>}
      </div>

      <div className="mt-4">
        {loading ? (
          <SkeletonRows rows={pageSize > 10 ? 10 : pageSize} />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : data.length === 0 ? (
          <EmptyState title={cfg.empty.title} hint={cfg.empty.hint} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <thead className="bg-surface">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.header} scope="col" className="caption-4 p-3">
                        {col.header}
                      </th>
                    ))}
                    {actions.length > 0 && (
                      <th scope="col" className="caption-4 p-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={rowTo ? 0 : undefined}
                      onClick={rowTo ? () => navigate(rowTo(row)) : undefined}
                      onKeyDown={
                        rowTo
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(rowTo(row));
                              }
                            }
                          : undefined
                      }
                      className={[
                        'border-t border-line',
                        rowTo ? 'cursor-pointer hover:bg-surface focus-visible:outline-2 focus-visible:outline-fg' : '',
                      ].join(' ')}
                    >
                      {columns.map((col) => (
                        <td key={col.header} className="body-6 p-3 align-top">
                          {col.cell(row)}
                        </td>
                      ))}
                      {actions.length > 0 && (
                        <td className="p-3 text-right align-top">
                          <div className="flex flex-wrap justify-end gap-1">
                            {actions
                              .filter((action) => !action.when || action.when(row))
                              .map((action) => (
                                <Button
                                  key={action.label}
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void runAction(action, row);
                                  }}
                                >
                                  {action.label}
                                </Button>
                              ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {total > 0 && !loading && !error && (
        <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="caption-5 text-muted">
            Page {page} of {pageCount} · {total} total
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      )}

      {primary?.form && (
        <FormDialog open={formOpen} form={primary.form} onClose={() => setFormOpen(false)} onSaved={reload} />
      )}
      <ReasonDialog
        open={!!reasonTarget}
        title={reasonTarget?.action.label ?? 'Confirm'}
        onClose={() => setReasonTarget(null)}
        onSubmit={async (reason) => {
          if (!reasonTarget) return;
          await runAction(reasonTarget.action, reasonTarget.row, reason);
        }}
      />
    </div>
  );
}

export type DetailField = { label: string; value: (row: any) => ReactNode; perm?: string[] };
export type DetailTab = { key: string; label: string; render: (row: any) => ReactNode; perm?: string[] };
export type DetailCfg = {
  resource: string;
  title: (row: any) => string;
  hint?: (row: any) => string;
  fields: DetailField[];
  primary?: { label: string; perm?: string[]; to?: (row: any) => string; form?: FormDef };
  tabs: DetailTab[];
};

export function DetailPage({ cfg }: { cfg: DetailCfg }): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data, loading, error, reload } = useOne<any>(cfg.resource, id);
  const [tab, setTab] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const fields = cfg.fields.filter((field) => !field.perm || can(...field.perm));
  const tabs = cfg.tabs.filter((item) => !item.perm || can(...item.perm));
  const active = tabs.find((item) => item.key === tab) ?? tabs[0];
  const primary = cfg.primary && (!cfg.primary.perm || can(...cfg.primary.perm)) ? cfg.primary : null;

  return (
    <div className="min-w-0">
      <PageHeader
        title={data ? cfg.title(data) : 'Details'}
        hint={data ? cfg.hint?.(data) : undefined}
        actions={
          primary && data ? (
            <Button
              onClick={() => {
                if (primary.form) setFormOpen(true);
                else if (primary.to) navigate(primary.to(data));
              }}
            >
              {primary.label}
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : !data ? (
        <EmptyState title="Nothing to show" hint="This record could not be found." />
      ) : (
        <>
          <dl className="mt-2 grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="border-b border-line pb-3">
                <dt className="caption-5 text-muted">{field.label}</dt>
                <dd className="body-5 mt-1">{field.value(data)}</dd>
              </div>
            ))}
          </dl>
          {active && (
            <section className="mt-8" aria-label={active.label}>
              <div role="tablist" aria-label="Details sections" className="flex flex-wrap gap-2 border-b border-line pb-2">
                {tabs.map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    role="tab"
                    size="sm"
                    variant={active.key === item.key ? 'primary' : 'ghost'}
                    aria-selected={active.key === item.key}
                    onClick={() => setTab(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <div role="tabpanel" className="mt-4">
                {active.render(data)}
              </div>
            </section>
          )}
        </>
      )}
      {primary?.form && (
        <FormDialog
          open={formOpen}
          form={primary.form}
          initial={data}
          onClose={() => setFormOpen(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

export type BoardMove<T> = { label: string; status: string; path: (row: T) => string; perm?: string[]; when?: (row: T) => boolean };
export type BoardCfg<T> = {
  title: string;
  hint?: string;
  resource: string;
  statusField: string;
  columns: { status: string; label: string; perm?: string[] }[];
  card: (row: T) => { title: string; meta?: string; tags?: string[] };
  to?: (row: T) => string;
  moves?: BoardMove<T>[];
  primary?: { label: string; perm?: string[]; form?: FormDef; to?: string };
  empty: { title: string; hint?: string };
};

export function BoardPage<T extends { id: string }>({ cfg }: { cfg: BoardCfg<T> }): JSX.Element {
  const navigate = useNavigate();
  const { can } = useAuth();
  const pageSize = 200;
  const { data, loading, error, reload } = useResource<T>(cfg.resource, undefined, 1, pageSize);
  const [formOpen, setFormOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ move: BoardMove<T>; row: T } | null>(null);
  const columns = cfg.columns.filter((col) => !col.perm || can(...col.perm));
  const moves = (cfg.moves ?? []).filter((move) => !move.perm || can(...move.perm));
  const primary = cfg.primary && (!cfg.primary.perm || can(...cfg.primary.perm)) ? cfg.primary : null;
  const to = cfg.to;

  return (
    <div className="min-w-0">
      <PageHeader
        title={cfg.title}
        hint={cfg.hint}
        actions={
          primary && (
            <Button onClick={() => { if (primary.form) setFormOpen(true); else if (primary.to) navigate(primary.to); }}>
              {primary.label}
            </Button>
          )
        }
      />
      {loading ? (
        <SkeletonRows rows={8} />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : data.length === 0 ? (
        <EmptyState title={cfg.empty.title} hint={cfg.empty.hint} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map((col) => {
            const rows = data.filter((row) => String((row as unknown as Record<string, unknown>)[cfg.statusField] ?? '') === col.status);
            return (
              <section key={col.status} aria-label={col.label} className="min-w-0">
                <h2 className="title-3 mb-3">
                  {col.label} <span className="caption-5 text-muted">({rows.length})</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {rows.length === 0 ? (
                    <p className="body-6 text-muted">None</p>
                  ) : (
                    rows.map((row) => {
                      const card = cfg.card(row);
                      return (
                        <article
                          key={row.id}
                          tabIndex={to ? 0 : undefined}
                          onClick={to ? () => navigate(to(row)) : undefined}
                          onKeyDown={
                            to
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(to(row));
                                  }
                                }
                              : undefined
                          }
                          className={[
                            'rounded-2xl border border-line p-4',
                            to ? 'cursor-pointer hover:bg-surface focus-visible:outline-2 focus-visible:outline-fg' : '',
                          ].join(' ')}
                        >
                          <p className="title-4">{card.title}</p>
                          {card.meta && <p className="body-6 mt-1 text-muted">{card.meta}</p>}
                          {card.tags && card.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {card.tags.map((tag) => (
                                <span key={tag} className="caption-5 w-fit rounded-md bg-surface px-2 py-0.5 text-muted">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {moves.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {moves.filter((move) => !move.when || move.when(row)).map((move) => (
                                <Button
                                  key={move.label}
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMoveTarget({ move, row });
                                  }}
                                >
                                  {move.label}
                                </Button>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {primary?.form && (
        <FormDialog open={formOpen} form={primary.form} onClose={() => setFormOpen(false)} onSaved={reload} />
      )}
      <ReasonDialog
        open={!!moveTarget}
        title={moveTarget?.move.label ?? 'Move'}
        submitLabel="Move"
        onClose={() => setMoveTarget(null)}
        onSubmit={async (reason) => {
          if (!moveTarget) return;
          await postJson(moveTarget.move.path(moveTarget.row), { status: moveTarget.move.status, reason }, 'POST');
          reload();
        }}
      />
    </div>
  );
}
