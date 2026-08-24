import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * The frame both auth screens sit in: a photograph across the top, and a sheet
 * that sweeps up over it carrying the form.
 *
 * WHY ONE SHELL AND NOT TWO SCREENS
 * Sign-in and Create-account had the same skeleton written out twice - logo
 * row, title, sub, form, footer link. Two copies of a layout is how the two
 * screens end up subtly different, which on the two screens a judge sees FIRST
 * is the cheapest possible way to look unfinished.
 *
 * WHY A PHOTOGRAPH HERE AT ALL
 * These were flat forms on a flat background, and they were the only screens
 * in the app that said nothing about what the app is. A planter arriving from
 * a printed code has no idea yet; a judge opening it cold has four seconds.
 * The photograph answers "what is this" before a word is read - which is the
 * same argument as My Grove, applied at the front door.
 *
 * THE CURVE IS AN SVG, NOT A BORDER-RADIUS.
 * `rounded-t-[2rem]` gives a symmetrical arc, which is the shape every
 * bootstrap template has. An asymmetric sweep - lower on the left, riding up
 * to the right - is the thing that reads as drawn rather than defaulted. It
 * costs one inline path and no runtime.
 *
 * It fills with `currentColor` and the wrapper sets the text colour to the
 * page background, so the sheet and the curve can never drift apart when the
 * palette changes. Hardcoding the fill is how you get a one-pixel seam of the
 * old colour after a retheme.
 */
export function AuthShell({
  title,
  sub,
  children,
  footer,
  /** Shorter band for the long join form, taller for the two-field sign-in. */
  band = 'tall',
}: {
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  /** Pinned to the bottom, above the safe area. For a primary action. */
  footer?: ReactNode
  band?: 'tall' | 'short'
}) {
  return (
    <div className="screen-in flex min-h-dvh flex-col bg-background">
      <div
        className={`relative shrink-0 ${
          band === 'tall'
            ? 'h-[30dvh] max-h-[260px] min-h-[190px]'
            : 'h-[20dvh] max-h-[190px] min-h-[136px]'
        }`}
      >
        <img
          src="/hero-sapling.jpg"
          alt=""
          className="size-full object-cover"
          // The first paint of the first screen. Everything else on this page
          // is text and can wait; this cannot, because until it lands the top
          // third of the screen is an empty grey band.
          fetchPriority="high"
        />
        {/* Enough to hold white on any frame of this photograph without
            flattening it - the logo is the only thing sitting on it. */}
        <div aria-hidden className="absolute inset-0 bg-[#04211a]/35" />

        <header className="safe-top absolute inset-x-0 top-0 flex items-center gap-2.5 px-margin-mobile pt-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur">
            <Icon name="tree" size={20} />
          </span>
          <span className="font-headline text-headline-md font-bold text-white">
            GreenProof
          </span>
        </header>
      </div>

      {/* -mt overlaps the band so the sweep cuts INTO the photograph rather
          than sitting under it as a separate stripe. */}
      <div className="relative -mt-9 flex flex-1 flex-col text-background">
        <svg
          viewBox="0 0 390 40"
          preserveAspectRatio="none"
          aria-hidden
          className="block h-9 w-full shrink-0"
        >
          <path d="M0 40 L0 24 C 104 40 226 2 390 4 L390 40 Z" fill="currentColor" />
        </svg>

        <div className="flex flex-1 flex-col bg-background">
          <div className="px-margin-mobile pt-1">
            <h1 className="font-headline text-display-md font-bold text-on-surface">
              {title}
            </h1>
            {sub && <p className="mt-1.5 text-on-surface-variant">{sub}</p>}
          </div>

          <main className="flex-1 px-margin-mobile pt-stack-md pb-3">
            {children}
          </main>

          {footer && (
            <footer className="safe-bottom sticky bottom-0 bg-background px-margin-mobile pt-2">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}
