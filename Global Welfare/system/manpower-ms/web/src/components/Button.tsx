import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
};

const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line bg-bg text-fg hover:border-primary hover:bg-soft-matcha',
  ghost: 'text-fg hover:bg-soft-matcha',
};

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2',
        size === 'md' ? 'button-md' : 'button-sm',
        'transition-[background-color,opacity,transform] duration-300 ease-weighted',
        'active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      ].join(' ')}
    />
  );
}
