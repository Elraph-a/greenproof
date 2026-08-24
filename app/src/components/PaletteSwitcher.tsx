import { useEffect, useState } from 'react'
import { PALETTES, getPalette, setPalette, type PaletteId } from '../lib/palette'

/**
 * A development-only control for switching the app's palette in place.
 *
 * DELIBERATELY NOT STYLED WITH THE APP'S OWN TOKENS.
 * Every colour here is a hardcoded neutral. If this panel were built out of
 * `bg-surface` and `text-on-surface` it would re-tint along with the thing it
 * is meant to be judging, and a swatch shown on a background that moved with
 * it is worthless for comparison. It looks like a tool because it is one.
 *
 * Parked mid-right: the header owns the top, the tab bar owns the bottom, and
 * the floating action button owns the bottom-right corner. The middle of the
 * right edge is the only place on this app that is never occupied.
 *
 * Press `p` to cycle — comparing two palettes properly means flicking between
 * them on the SAME screen, and going back to a panel between every look is
 * enough friction that you stop doing it.
 */
export function PaletteSwitcher() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<PaletteId>(getPalette)

  function choose(id: PaletteId) {
    setPalette(id)
    setCurrent(id)
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'p' || e.metaKey || e.ctrlKey || e.altKey) return
      // Never steal the keystroke from a field — species names contain p.
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
        return
      const i = PALETTES.findIndex((p) => p.id === current)
      const next = PALETTES[(i + 1) % PALETTES.length]
      if (next) choose(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current])

  if (!import.meta.env.DEV) return null

  const active = PALETTES.find((p) => p.id === current) ?? PALETTES[0]

  return (
    <div className="fixed right-0 top-1/2 z-[90] -translate-y-1/2 select-none">
      {open ? (
        <div className="w-[248px] rounded-l-xl bg-[#15171a] p-2.5 text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-white/45">
              Palette · dev only
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close palette switcher"
              className="-my-1 -mr-1 px-2 py-1 text-[15px] leading-none text-white/45 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                aria-pressed={p.id === current}
                className={`flex items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                  p.id === current ? 'bg-white/12' : 'hover:bg-white/[0.06]'
                }`}
              >
                {/* Paper and green only. Showing the amber in all four
                    swatches would be four identical chips saying nothing — it
                    is fixed across every palette, which is the whole point. */}
                <span className="mt-0.5 flex h-4 shrink-0 overflow-hidden rounded ring-1 ring-white/20">
                  <span
                    style={{ background: p.swatches[0] }}
                    className="block h-full w-5"
                  />
                  <span
                    style={{ background: p.swatches[1] }}
                    className="block h-full w-5"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight">
                    {p.name}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-white/50">
                    {p.blurb}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="px-2 pb-0.5 pt-2 text-[10px] leading-snug text-white/35">
            Press <b className="text-white/60">p</b> to cycle. Amber is
            identical in all four, so it only ever means money.
          </p>
        </div>
      ) : (
        /* A sliver, at half opacity until touched. It sits over the app, and
           an opaque dev widget parked on the filter row is a thing you end up
           judging the palette around. The `p` key does the real work; this is
           only the way back to the panel. */
        <button
          onClick={() => setOpen(true)}
          aria-label={`Palette: ${active.name}. Open switcher`}
          title={`${active.name} — press p to cycle`}
          className="flex w-[18px] flex-col items-center gap-1 rounded-l-md bg-[#15171a]/70 py-2 opacity-45 transition-opacity hover:w-auto hover:px-1.5 hover:opacity-100 focus-visible:opacity-100"
        >
          <span
            style={{ background: active.swatches[1] }}
            className="block size-2 rounded-full ring-1 ring-white/30"
          />
          <span
            style={{ background: active.swatches[0] }}
            className="block size-2 rounded-full ring-1 ring-white/30"
          />
        </button>
      )}
    </div>
  )
}
