import { useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { postJson, useResource } from '../lib/useApi';
import { Button } from './Button';
import { Field } from './Field';

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.';
}

function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="rise w-full max-w-lg rounded-2xl border border-line bg-bg p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="heading-6">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
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

export function PageHeader({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }): JSX.Element {
  return (
    <header className="rise mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="heading-5">{title}</h1>
        {hint && <p className="body-6 mt-2 text-muted">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function StatusBadge({ value }: { value: string }): JSX.Element {
  const bad = value === 'REJECTED' || value === 'CLOSED_UNSUCCESSFULLY';
  return (
    <span className={`caption-4 inline-flex w-fit rounded-md bg-surface px-2 py-0.5 ${bad ? 'text-danger' : 'text-fg'}`}>
      {value}
    </span>
  );
}

export function Money({ amount, currency }: { amount: string | number | null | undefined; currency: string }): JSX.Element {
  if (amount === null || amount === undefined || amount === '') return <span className="text-muted">None</span>;
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isFinite(value)) {
    try {
      return <>{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)}</>;
    } catch {
      return <>{String(amount)}</>;
    }
  }
  return <>{String(amount)}</>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-line p-6">
      <p className="title-3">{title}</p>
      {hint && <p className="body-6 mt-2 text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }): JSX.Element {
  return (
    <div className="rounded-2xl border border-line p-6">
      <p role="alert" className="body-5 text-danger">
        {message}
      </p>
      {retry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows }: { rows?: number }): JSX.Element {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: rows ?? 5 }, (_, i) => (
        <div key={i} className="h-10 rounded-lg bg-surface" />
      ))}
    </div>
  );
}

export function ReasonDialog({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
  submitLabel?: string;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label htmlFor="reason" className="title-4">
          Reason
        </label>
        <textarea
          id="reason"
          rows={3}
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="body-3 w-full rounded-lg border border-line bg-bg px-3 py-2 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        />
        {error && (
          <p role="alert" className="body-6 text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{submitLabel ?? 'Submit'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean' | 'password' | 'hidden';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  optionsResource?: { resource: string; label: (row: any) => string; value?: (row: any) => string; params?: Record<string, string | number | boolean | undefined> };
  help?: string;
};

export type FormDef = {
  title: string;
  path: string;
  method?: 'POST' | 'PATCH';
  submitLabel?: string;
  fields: FieldDef[];
  reason?: boolean;
};

const controlClass =
  'body-3 w-full rounded-lg border border-line bg-bg px-3 py-2 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg';

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}): JSX.Element {
  const id = 'field-' + field.name;
  const optionsResource = field.optionsResource;
  const { data: optionRows } = useResource<any>(optionsResource?.resource ?? '', optionsResource?.params, 1, 200);

  if (field.type === 'hidden') return <input id={id} type="hidden" value={String(value)} readOnly />;

  if (field.type === 'boolean') {
    return (
      <label htmlFor={id} className="body-5 flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          required={field.required}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="title-4">
          {field.label}
        </label>
        <textarea
          id={id}
          rows={3}
          required={field.required}
          placeholder={field.placeholder}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={controlClass}
        />
      </div>
    );
  }

  if (field.type === 'select' || optionsResource) {
    const options = field.options ?? optionRows.map((row) => ({ value: optionsResource?.value?.(row) ?? String(row.id), label: optionsResource?.label?.(row) ?? String(row.id) }));
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="title-4">
          {field.label}
        </label>
        <select
          id={id}
          required={field.required}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={controlClass}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <Field
      id={id}
      label={field.label}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'password' ? 'password' : 'text'}
      required={field.required}
      placeholder={field.placeholder}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FormDialog({
  open,
  form,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  form: FormDef | null;
  initial?: Record<string, any> | null;
  onClose: () => void;
  onSaved?: () => void;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formKey = form ? [form.path, form.method ?? 'POST', form.title, form.fields.map((f) => f.name).join(',')].join('|') : '';
  const seedKey = JSON.stringify(initial ?? null);

  useEffect(() => {
    const next: Record<string, string | boolean> = {};
    for (const field of form?.fields ?? []) {
      const raw = initial?.[field.name];
      next[field.name] = field.type === 'boolean' ? Boolean(raw) : raw === undefined || raw === null ? '' : String(raw);
    }
    setValues(next);
    setReason('');
    setError(null);
  }, [formKey, seedKey]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const field of form.fields) {
      const value = values[field.name];
      if (field.type === 'number') body[field.name] = Number(value);
      else if (field.type === 'boolean') body[field.name] = Boolean(value);
      else body[field.name] = String(value ?? '');
    }
    if (form.reason) body.reason = reason.trim();
    try {
      await postJson(form.path, body, form.method ?? 'POST');
      onClose();
      onSaved?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={form?.title ?? ''} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {(form?.fields ?? []).map((field) => (
            <div key={field.name} className="flex flex-col gap-1">
              <FieldControl field={field} value={values[field.name] ?? ''} onChange={(value) => setValues((v) => ({ ...v, [field.name]: value }))} />
              {field.help && <p className="caption-5 text-muted">{field.help}</p>}
            </div>
          ))}
        </div>
        {form?.reason && (
          <div className="flex flex-col gap-2">
            <label htmlFor="form-reason" className="title-4">
              Reason
            </label>
            <textarea
              id="form-reason"
              rows={3}
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={controlClass}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="body-6 text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving' : form?.submitLabel ?? 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
