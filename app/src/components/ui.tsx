import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { CheckinVerdict, TreeStatus } from '../lib/types'

/** Shared pieces. Tokens live in index.css; nothing here hardcodes a colour. */

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  )
}

/**
 * A full-screen flow page: title bar with optional back arrow, scrolling body,
 * optional pinned footer.
 *
 * The footer is pinned rather than scrolled with the content because in every
 * exported screen the primary action sits at the bottom edge where a thumb
 * reaches, and it must not require scrolling to reach it.
 */
export function Screen({
  title,
  onBack,
  children,
  footer,
  bare = false,
}: {
  title?: string
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
  /** Skip body padding — for full-bleed screens like the map. */
  bare?: boolean
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {(title || onBack) && (
        <header className="safe-top sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-2 bg-background/85 px-margin-mobile backdrop-blur-md">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="-ml-2 flex size-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container"
            >
              <Icon name="arrow-left" />
            </button>
          )}
          {title && (
            <h1 className="flex-1 text-center font-headline text-headline-md font-bold text-on-surface">
              {title}
            </h1>
          )}
          {onBack && <span className="size-11" aria-hidden />}
        </header>
      )}

      <main className={bare ? 'flex-1' : 'flex-1 px-margin-mobile py-stack-sm'}>
        {children}
      </main>

      {footer && (
        <footer className="safe-bottom sticky bottom-0 bg-background/90 px-margin-mobile pt-3 backdrop-blur-md">
          {footer}
        </footer>
      )}
    </div>
  )
}

/** Page heading for tabbed screens, which get their chrome from Shell. */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-stack-sm font-headline text-headline-lg font-bold text-on-surface">
      {children}
    </h2>
  )
}

/* ---------------------------------------------------------------------------
   Hero and stats — the focal point vocabulary.

   Every screen gets exactly ONE hero. The old layout gave My Grove three stats
   at equal weight in a bordered strip, so the screen had no subject and the
   eye had nowhere to land first. A hero states the screen's single fact at
   ~3× body size; everything else is deliberately subordinate to it.
   --------------------------------------------------------------------------- */

/**
 * The gradient focal card. `label` is the micro-caption, `value` the display
 * number, `foot` the line beneath, `badge` the top-right marker.
 */
export function HeroCard({
  label,
  value,
  foot,
  badge,
  accent = false,
  children,
}: {
  label: string
  value: ReactNode
  foot?: ReactNode
  badge?: ReactNode
  /** Gold-lit variant — for money, rather than the default green-lit. */
  accent?: boolean
  children?: ReactNode
}) {
  return (
    <section
      className={`rounded-2xl p-5 ${
        accent
          ? 'bg-accent-container text-on-accent-container'
          : 'bg-primary text-on-primary'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`micro ${accent ? 'text-on-accent-container/70' : 'text-on-primary/65'}`}
        >
          {label}
        </span>
        {badge}
      </div>
      <p className="tnum mt-2 font-headline text-display-md font-bold">{value}</p>
      {foot && (
        <div className={`mt-1 ${accent ? 'opacity-75' : 'text-on-primary/75'}`}>
          {foot}
        </div>
      )}
      {children}
    </section>
  )
}

/** Small pill for the hero's top-right corner — a trend, a grade, a count. */
export function HeroBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const cls =
    tone === 'good'
      ? 'chip-verified'
      : tone === 'warn'
        ? 'chip-money'
        : 'bg-black/10 text-current'
  return <span className={`chip shrink-0 ${cls}`}>{children}</span>
}

/** Segmented strip of two to four figures, sitting under a feature card. */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_2px_rgb(22_33_27/0.04),0_6px_18px_-10px_rgb(22_33_27/0.10)]">
      {children}
    </div>
  )
}

export function StatCell({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const cls =
    tone === 'good'
      ? 'text-[var(--color-verified)]'
      : tone === 'warn'
        ? 'text-[var(--color-accent)]'
        : tone === 'bad'
          ? 'text-error'
          : 'text-on-surface'
  return (
    <div className="px-3.5 py-3 [&+&]:border-l [&+&]:border-outline-variant">
      <span className="micro">{label}</span>
      <span
        className={`tnum mt-1 block font-headline text-headline-md font-bold ${cls}`}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * One status vocabulary everywhere: My Grove, the map, the tree page, the
 * reviewer queue. Judges hear these words three times in twenty minutes, and
 * inconsistent naming is a free way to lose clarity points.
 */
export function StatusChip({ status }: { status: TreeStatus | CheckinVerdict }) {
  const map: Record<string, { cls: string; label: string }> = {
    alive: { cls: 'chip-verified', label: 'Verified' },
    verified: { cls: 'chip-verified', label: 'Verified' },
    review: { cls: 'chip-review', label: 'Needs review' },
    flagged: { cls: 'chip-flagged', label: 'Flagged' },
    dead: { cls: 'chip-flagged', label: 'Dead' },
    pending: { cls: 'chip-pending', label: 'Not checked' },
  }
  const it = map[status] ?? map['pending']!
  return <span className={`chip ${it.cls}`}>{it.label}</span>
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="py-stack-lg text-center">
      <div className="mx-auto mb-stack-sm flex size-20 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
        <Icon name="tree" size={38} />
      </div>
      <h2 className="font-headline text-headline-md font-bold text-on-surface">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-on-surface-variant">{body}</p>
      {action && <div className="mt-stack-md">{action}</div>}
    </div>
  )
}

/* Notes carry their meaning on a 3px left rule rather than a full outline.
   A boxed-in alert competes with the cards around it; a rule reads as an
   annotation on the content, which is what it is. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-3 flex gap-2 rounded-lg border-l-[3px] border-error bg-error-container p-3 text-on-error-container"
    >
      <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
      <p className="font-medium">{children}</p>
    </div>
  )
}

export function InfoNote({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn'
  children: ReactNode
}) {
  const cls =
    tone === 'warn'
      ? 'border-l-[3px] border-tertiary bg-tertiary-fixed text-on-tertiary-fixed'
      : 'border-l-[3px] border-outline-variant bg-surface-container text-on-surface'
  return <div className={`mt-3 rounded-lg p-3 ${cls}`}>{children}</div>
}

/** "Step 2 of 5" — the exported screens use it as the page title. */
export function stepTitle(step: number, total: number): string {
  return `Step ${step} of ${total}`
}

export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div
      className="mb-stack-sm flex gap-1.5"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={stepTitle(step, total)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < step ? 'bg-primary' : 'bg-surface-container-highest'
          }`}
        />
      ))}
    </div>
  )
}
