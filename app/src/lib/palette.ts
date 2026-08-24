/**
 * Palette selection — a development-only tool for choosing the app's colours
 * against the real app rather than against a swatch sheet.
 *
 * TWO INDEPENDENT AXES, deliberately.
 *   `data-palette`  paper and green
 *   `data-money`    the one hue that carries a meaning on its own
 *
 * They are separate because they are separate questions, and because a hue
 * that means "money" cannot be judged while the paper under it is also
 * changing. See styles/palettes.css for where each option came from.
 *
 * WHY THIS IS NOT A USER-FACING THEME PICKER
 * The app ships exactly one palette. Letting a planter choose would mean
 * every screenshot, every support answer and every judge's phone could look
 * different, and the whole point of a hue that means money is that it means
 * the same thing everywhere. This exists so ONE decision gets made properly,
 * and then the winner is promoted into the @theme block in index.css and this
 * file and its switcher are deleted.
 *
 * Vite replaces `import.meta.env.DEV` with a literal, so every call below
 * folds to a no-op and the switcher is dropped from the production bundle.
 */

export const PALETTES = [
  {
    id: 'field',
    name: 'Field',
    from: 'what we ship',
    blurb: 'Warm paper, forest green. The paper is right; the green is the outlier.',
    swatches: ['#f7f6f2', '#14432c'],
  },
  {
    id: 'sand',
    name: 'Sand',
    from: 'veritree',
    blurb: 'Warmest paper here. Flatters soil and bark. Teal-forest green.',
    swatches: ['#f4efe9', '#0c483c'],
  },
  {
    id: 'ledger',
    name: 'Ledger',
    from: 'Sylvera, Wren',
    blurb: 'Cream, and a green dark enough to be ink. Reads as an audit.',
    swatches: ['#f7f5ef', '#0a3028'],
  },
  {
    id: 'canopy',
    name: 'Canopy',
    from: 'Terraformation',
    blurb: 'The only cool page, and the only green that reads as a colour.',
    swatches: ['#f3f7f4', '#1a5035'],
  },
  {
    id: 'ink',
    name: 'Ink',
    from: 'ours, no precedent',
    blurb: 'Most restrained. Wins on looking better, not on looking right.',
    swatches: ['#f6f6f4', '#0e2f20'],
  },
  {
    id: 'signal',
    name: 'Signal',
    from: 'Pachama, Sylvera',
    blurb: 'Near-black green, one bright accent — spent on Verified.',
    swatches: ['#fbfbf9', '#042e22'],
  },
] as const

export const MONEY = [
  {
    id: 'orange',
    name: 'Orange',
    note: 'What we ship. Hue 26 — nearer the alert colours than the money ones.',
    swatch: '#e2680b',
  },
  {
    id: 'gold',
    name: 'Gold',
    note: 'What the category does, and what MTN MoMo is. Better contrast too.',
    swatch: '#a06b00',
  },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']
export type MoneyId = (typeof MONEY)[number]['id']

const PALETTE_KEY = 'gp.palette'
const MONEY_KEY = 'gp.money'
const DEFAULT_PALETTE: PaletteId = 'field'
const DEFAULT_MONEY: MoneyId = 'orange'

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    // Private browsing, or storage disabled. Not worth failing over.
    return fallback
  }
}

export function getPalette(): PaletteId {
  if (!import.meta.env.DEV) return DEFAULT_PALETTE
  return read(PALETTE_KEY, PALETTES.map((p) => p.id), DEFAULT_PALETTE)
}

export function getMoney(): MoneyId {
  if (!import.meta.env.DEV) return DEFAULT_MONEY
  return read(MONEY_KEY, MONEY.map((m) => m.id), DEFAULT_MONEY)
}

export function setPalette(id: PaletteId): void {
  if (!import.meta.env.DEV) return
  document.documentElement.dataset.palette = id
  try {
    localStorage.setItem(PALETTE_KEY, id)
  } catch {
    /* the attribute is already applied; persistence is the optional half */
  }
}

export function setMoney(id: MoneyId): void {
  if (!import.meta.env.DEV) return
  document.documentElement.dataset.money = id
  try {
    localStorage.setItem(MONEY_KEY, id)
  } catch {
    /* as above */
  }
}

/**
 * Applied SYNCHRONOUSLY from main.tsx, before React renders.
 *
 * Doing it in an effect instead would paint the default for one frame and
 * then swap — and a flash of the colours you are trying to compare against is
 * precisely the thing that makes a comparison untrustworthy.
 */
export function applyStoredPalette(): void {
  if (!import.meta.env.DEV) return
  document.documentElement.dataset.palette = getPalette()
  document.documentElement.dataset.money = getMoney()
}
