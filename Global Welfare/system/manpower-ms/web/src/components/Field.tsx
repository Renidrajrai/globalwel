import type { InputHTMLAttributes, ReactNode } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  invalid?: boolean;
  trailing?: ReactNode;
};

export function Field({ label, invalid, trailing, id, className = '', ...rest }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="title-4">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={invalid || undefined}
          {...rest}
          className={[
            'body-3 w-full rounded-lg border bg-bg px-3 py-2 placeholder:text-muted',
            'transition-colors duration-300 ease-weighted',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
            invalid ? 'border-danger' : 'border-line',
            trailing ? 'pr-10' : '',
            className,
          ].join(' ')}
        />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
    </div>
  );
}
