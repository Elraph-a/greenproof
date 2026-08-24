/**
 * Palette selection — a development-only tool for choosing the app's colours
 * against the real app rather than against a swatch sheet.
 *
 * WHY THIS IS NOT A USER-FACING THEME PICKER
 * The app ships exactly one palette. Letting a planter choose would mean every
 * screenshot, every support answer and every judge's phone could look
 * different, and the whole point of "amber means money" is that it means the
 * same thing everywhere. This exists so ONE decision gets made properly, and
 * then the winner is promoted into the @theme block in index.css and this file
 * and its switcher are deleted.
 *
 * Vite replaces `import.meta.env.DEV` with a literal, so every call below
 * folds to a no-op and the switcher is dropped from the production bundle.
 */

export const PALETTES = [
  {
    id: 'field',
    name: 'Field',
    blurb: 'Warm paper, deep forest. What we ship today.',
    swatches: ['#f7f6f2', '#14432c', '#e2680b'],
  },
  {
    id: 'ink',
    name: 'Ink',
    blurb: 'Near-neutral paper, near-black green. Highest contrast.',
    swatches: ['#f6f6f4', '#0e2f20', '#e2680b'],
  },
  {
    id: 'canopy',
    name: 'Canopy',
    blurb: 'Cool green mist, and a green that reads as green.',
    swatches: ['#f2f6f3', '#0b5e3a', '#e2680b'],
  },
  {
    id: 'slate',
    name: 'Slate',
    blurb: 'Cool grey. Amber is loudest against its complement.',
    swatches: ['#f4f5f6', '#13402c', '#e2680b'],
  },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']

const KEY = 'gp.palette'
const DEFAULT: PaletteId = 'field'

function isPalette(v: string | null): v is PaletteId {
  return PALETTES.some((p) => p.id === v)
}

export function getPalette(): PaletteId {
  if (!import.meta.env.DEV) return DEFAULT
  try {
    const v = localStorage.getItem(KEY)
    return isPalette(v) ? v : DEFAULT
  } catch {
    // Private browsing, or storage disabled. Not worth failing over.
    return DEFAULT
  }
}

export function setPalette(id: PaletteId): void {
  if (!import.meta.env.DEV) return
  document.documentElement.dataset.palette = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* the attribute is already applied; persistence is the optional half */
  }
}

/**
 * Applied SYNCHRONOUSLY from main.tsx, before React renders.
 *
 * Doing it in an effect instead would paint the default palette for one frame
 * and then swap — and a flash of the colours you are trying to compare against
 * is precisely the thing that makes a comparison untrustworthy.
 */
export function applyStoredPalette(): void {
  if (!import.meta.env.DEV) return
  document.documentElement.dataset.palette = getPalette()
}
