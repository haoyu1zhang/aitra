import type { ReactNode } from 'react';

export function Section(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">{props.title}</h2>
      {props.description && <p className="mt-1 text-sm text-slate-500">{props.description}</p>}
      <div className="mt-5 space-y-5">{props.children}</div>
    </section>
  );
}

export function Field(props: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={props.htmlFor} className="block text-sm font-medium text-slate-700">
        {props.label}
      </label>
      <div className="mt-1.5">{props.children}</div>
      {props.hint && <p className="mt-1.5 text-xs text-slate-500">{props.hint}</p>}
    </div>
  );
}

export const inputClass =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  'disabled:bg-slate-100 disabled:text-slate-500';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const variant = props.variant ?? 'secondary';
  const styles = {
    primary: 'bg-accent text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:text-red-300',
  }[variant];
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles}`}
    >
      {props.children}
    </button>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm text-slate-700">{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${props.checked ? 'bg-accent' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${props.checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </label>
  );
}

export type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-slate-200 bg-slate-50 text-slate-700',
  }[notice.tone];
  return (
    <p role="status" className={`rounded-lg border px-3 py-2 text-sm break-words ${tone}`}>
      {notice.text}
    </p>
  );
}
