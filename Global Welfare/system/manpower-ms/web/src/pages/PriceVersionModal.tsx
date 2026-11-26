import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/Button';

const cx = {
  input: 'body-3 w-full rounded-lg border border-line bg-bg px-3 py-2 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
  btn: 'button-sm inline-flex items-center justify-center rounded-lg border border-line bg-bg px-2 py-1 text-fg hover:bg-surface disabled:pointer-events-none disabled:opacity-50',
  primary: 'button-md inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-on-primary hover:opacity-90 disabled:pointer-events-none disabled:opacity-50',
};
const post = (path: string, body: unknown = {}) => api(path, { method: 'POST', body });
const dateOf = (value: unknown) => (value ? String(value).slice(0, 10) : '');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-label={title} className="rise max-h-[90vh] w-full max-w-[38.4rem] overflow-y-auto rounded-2xl border border-line bg-bg p-7 sm:p-8"><div className="flex items-start justify-between gap-4"><h2 className="heading-6">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:text-fg">×</button></div>{children}</div></div>;
}
export type Meta = { payerTypes: string[]; candidatePayer: string };
type Comp = { componentType: string; payer: string; amount: string };

export function PriceVersionModal({ row, positionId: initialPositionId, initialPrice = false, meta, onClose }: { row?: any; positionId?: string; initialPrice?: boolean; meta: Meta; onClose: (saved?: boolean) => void }): JSX.Element {
  const editing = !!row;
  const [positions, setPositions] = useState<any[]>([]);
  const [positionId, setPositionId] = useState(row?.positionId ?? initialPositionId ?? '');
  const [currency, setCurrency] = useState(row?.currency ?? 'NPR');
  const [from, setFrom] = useState(dateOf(row?.effectiveFrom) || (initialPrice ? today() : ''));
  const [to, setTo] = useState(dateOf(row?.effectiveTo));
  const [reason, setReason] = useState(row?.changeReason ?? (initialPrice ? 'Initial price' : ''));
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
  const invalid = (!editing && !positionId) || !from || (!initialPrice && (reason.trim().length < 3 || !ref.trim())) || comps.some((c) => !c.componentType.trim());

  return (
    <Modal title={editing ? (initialPrice ? 'Review initial price' : 'Edit price draft') : (initialPrice ? 'Add initial price' : 'Create price version')} onClose={() => onClose(false)}>
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
          <label htmlFor="pv-reason" className="title-4">Reason for this price {initialPrice ? '(optional)' : '*'}</label>
          <textarea id="pv-reason" className={cx.input} value={reason} onChange={(e) => setReason(e.target.value)} />
          {fe.changeReason && <p className="caption-5 text-danger">{fe.changeReason}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pv-ref" className="title-4">Compliance reference {initialPrice ? '(optional)' : '*'}</label>
          <input id="pv-ref" className={cx.input} value={ref} onChange={(e) => setRef(e.target.value)} />
          <p className="caption-5 text-muted">{initialPrice ? 'Not required for the initial price.' : 'Required before this can be submitted for approval.'}</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onClose(false)}>Cancel</Button>
        <button type="button" className={cx.primary} disabled={busy || invalid} onClick={save}>{busy ? 'Saving...' : initialPrice ? 'Save initial price' : 'Save draft'}</button>
      </div>
    </Modal>
  );
}
