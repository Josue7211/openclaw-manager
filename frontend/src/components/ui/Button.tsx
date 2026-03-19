import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    border: 'none',
    color: 'var(--text-on-color)',
  },
  secondary: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  },
  ghost: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
  },
  danger: {
    background: 'var(--red-500)',
    border: 'none',
    color: 'var(--text-on-color)',
  },
}

export const Button = React.memo(function Button({
  variant = 'primary',
  children,
  className,
  disabled,
  style,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={className}
      disabled={disabled}
      style={{
        borderRadius: 'var(--radius-md)',
        padding: '8px 16px',
        fontSize: 'var(--text-base)',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        transition:
          'background var(--duration-fast) ease, opacity var(--duration-fast) ease, transform 0.1s ease',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : undefined,
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
})
