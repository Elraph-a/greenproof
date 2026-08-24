import { useEffect, useState } from 'react'
import {
  MONEY,
  PALETTES,
  getMoney,
  getPalette,
  setMoney,
  setPalette,
  type MoneyId,
  type PaletteId,
} from '../lib/palette'

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
 * the floating action button owns the bottom-right corner.
 *
 * Keys: `p` cycles the palette, `m` toggles the money hue. Comparing two
 * options properly means flicking between them on the SAME screen, and going
 * back to a panel between every look is enough friction that you stop doing
 * it.
 */
export function PaletteSwitcher() {
  const [open, setOpen] = useState(false)
  const [palette, setPaletteState] = useState<PaletteId>(getPalette)
  const [money, setMoneyState] = useState<MoneyId>(getMoney)

  function choosePalette(id: PaletteId) {
    setPalette(id)
    setPaletteState(id)
  }

  function chooseMoney(id: MoneyId) {
    setMoney(id)
    setMoneyState(id)
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'p' && e.key !== 'm') return
      // Never steal the keystroke from a field — species names contain both.
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
        return
      if (e.key === 'p') {
        const i = PALETTES.findIndex((p) => p.id === palette)
        const next = PALETTES[(i + 1) % PALETTES.length]
        if (next) choosePalette(next.id)
      } else {
        chooseMoney(money === 'orange' ? 'gold' : 'orange')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, money])

  if (!import.meta.env.DEV) return null

  const active = PALETTES.find((p) => p.id === palette) ?? PALETTES[0]
  const activeMoney = MONEY.find((m) => m.id === money) ?? MONEY[0]

  return (
    <div className="fixed right-0 top-1/2 z-[90] -translate-y-1/2 select-none">
      {open ? (
        <div className="max-h-[92dvh] w-[252px] overflow-y-auto rounded-l-xl bg-[#15171a] p-2.5 text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between px-1 pb-1.5">
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

          <div className="flex flex-col gap-0.5">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => choosePalette(p.id)}
                aria-pressed={p.id === palette}
                className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  p.id === palette ? 'bg-white/12' : 'hover:bg-white/[0.06]'
                }`}
              >
                {/* Paper and green only. The money hue is its own row below,
                    so repeating it in six swatches would say nothing. */}
                <span className="mt-1 flex h-4 shrink-0 overflow-hidden rounded ring-1 ring-white/20">
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
                    {p.name}{' '}
                    <span className="font-normal text-white/40">{p.from}</span>
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-white/50">
                    {p.blurb}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-2 border-t border-white/10 pt-2">
            <span className="block px-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-white/45">
              Money hue
            </span>
            <div className="flex gap-1">
              {MONEY.map((m) => (
                <button
                  key={m.id}
                  onClick={() => chooseMoney(m.id)}
                  aria-pressed={m.id === money}
                  title={m.note}
                  className={`flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    m.id === money ? 'bg-white/12' : 'hover:bg-white/[0.06]'
                  }`}
                >
                  <span
                    style={{ background: m.swatch }}
                    className="block size-3.5 shrink-0 rounded-full ring-1 ring-white/25"
                  />
                  <span className="text-[12px] font-semibold">{m.name}</span>
                </button>
              ))}
            </div>
            <p className="px-1 pt-1.5 text-[10px] leading-snug text-white/40">
              {activeMoney.note}
            </p>
          </div>

          <p className="px-1 pb-0.5 pt-2 text-[10px] leading-snug text-white/35">
            <b className="text-white/60">p</b> cycles palette,{' '}
            <b className="text-white/60">m</b> toggles money. Judge on My Grove,
            where the photographs are.
          </p>
        </div>
      ) : (
        /* A sliver, at half opacity until touched. It sits over the app, and
           an opaque dev widget parked on the filter row is a thing you end up
           judging the palette around. The keys do the real work; this is only
           the way back to the panel. */
        <button
          onClick={() => setOpen(true)}
          aria-label={`Palette: ${active.name}, money ${activeMoney.name}. Open switcher`}
          title={`${active.name} · ${activeMoney.name} — p / m to cycle`}
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
          <span
            style={{ background: activeMoney.swatch }}
            className="block size-2 rounded-full ring-1 ring-white/30"
          />
        </button>
      )}
    </div>
  )
}
