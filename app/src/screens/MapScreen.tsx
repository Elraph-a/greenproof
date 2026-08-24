import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { DEMO, demoTrees } from '../lib/demo'
import { photoUrls } from '../lib/photos'
import { treeLabel } from '../lib/trees'
import type { Tree } from '../lib/types'
import { ErrorNote, StatusChip } from '../components/ui'

/**
 * Live map of every registered tree.
 *
 * Markers are `L.divIcon` with inline SVG, NOT Leaflet's default pin. The
 * default icon loads from an image URL that Vite's bundler rewrites, which is
 * the single most common react-leaflet deployment bug — markers work in dev
 * and silently vanish in production. Inline SVG has no asset to lose, colours
 * by status for free, and unlike the CircleMarker this replaced it can carry a
 * glyph, so a pin says "tree" rather than "dot".
 */

interface MapTree extends Tree {
  last_wide_photo: string | null
  thumb: string | null
}

/**
 * Leaflet paints SVG via JS, not CSS classes, so these have to be literal
 * values rather than token references — a `var(--color-…)` string is not
 * resolved by Leaflet's path renderer.
 *
 * Kept in sync with index.css by hand. These are the LIGHT-theme values even
 * though the surrounding chrome is dark, because the pins sit on pale OSM
 * tiles, not on the app's background. `alive` is the lighter --color-verified
 * rather than --color-primary: at 9px on a pale tile, near-black green reads
 * as a dead pin rather than a healthy tree.
 */
const STATUS_COLOUR: Record<string, string> = {
  alive: '#1a5035', // --color-verified
  pending: '#6b7c73', // --color-outline
  flagged: '#a3271f', // --color-error
  dead: '#a3271f',
}

const PIN_W = 30
const PIN_H = 36

/**
 * A teardrop pin with a sprout inside it.
 *
 * THE GLYPH IS FILLED, not stroked, and that is not a style choice. The rest
 * of this app draws icons as 2px strokes on a 24px grid, which is right at
 * button size and turns to mush at the 13px this glyph actually occupies on a
 * pin. Solid shapes hold their silhouette at any size, which is the only thing
 * that matters here — nobody reads a map pin, they recognise its outline.
 *
 * The white ring is load-bearing too: OSM tiles run from near-white roads to
 * mid-green parks, and a dark green pin dropped straight onto a park disappears
 * into it. The ring gives every pin the same edge regardless of what is under
 * it.
 */
function pinSvg(fill: string): string {
  // A near-circular head with a short tail, not the tall narrow teardrop of a
  // classic map pin. The head is where the glyph lives, so the more of the
  // shape it occupies the more legible the sprout is at this size. Drawn as
  // ONE path - a circle plus a triangle would show a seam through the middle
  // once the white ring is stroked around it.
  //
  // The arc runs the long way round (large-arc-flag 1) from the lower-left
  // tangent point over the top to the lower-right, then straight down to the
  // tip at (12, 29).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 24 30">
  <path d="M5.69 20.51A11 11 0 1 1 18.31 20.51L12 29Z"
        fill="${fill}" stroke="#ffffff" stroke-width="1.7"
        stroke-linejoin="round"/>
  <g fill="#ffffff">
    <path d="M12 12.3c-.15-3.1-2.2-5.25-5.5-5.8-.33 3.2 1.75 5.5 5.5 5.8Z"/>
    <path d="M12 12.3c.15-3.1 2.2-5.25 5.5-5.8.33 3.2-1.75 5.5-5.5 5.8Z"/>
    <rect x="11.3" y="10.4" width="1.4" height="6.4" rx=".7"/>
  </g>
</svg>`
}

/**
 * Built once per status and reused across every marker. Leaflet keeps a
 * reference to the icon rather than cloning it, so handing each of forty
 * markers its own identical DivIcon would allocate forty DOM templates for
 * four distinct pins.
 */
const PIN_CACHE = new Map<string, L.DivIcon>()

function pinIcon(status: string): L.DivIcon {
  const key = status in STATUS_COLOUR ? status : 'pending'
  let icon = PIN_CACHE.get(key)
  if (!icon) {
    icon = L.divIcon({
      html: pinSvg(STATUS_COLOUR[key]!),
      // MUST be empty. Leaflet's default `leaflet-div-icon` class paints a
      // white box with a blue border behind whatever you give it, so without
      // this every pin sits in a little rectangle.
      className: '',
      iconSize: [PIN_W, PIN_H],
      // The TIP is the coordinate, not the centre. Anchoring at the middle
      // would place every tree half a pin north of where it actually stands,
      // which at zoom 17 is several metres - and metres are the unit this
      // whole product argues about.
      iconAnchor: [PIN_W / 2, PIN_H],
      popupAnchor: [0, -PIN_H + 8],
    })
    PIN_CACHE.set(key, icon)
  }
  return icon
}

// UG campus, Legon — where the pilot happens. Only used until trees load.
const FALLBACK_CENTRE: [number, number] = [5.6505, -0.1962]

export function MapScreen() {
  const [trees, setTrees] = useState<MapTree[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    ;(async () => {
      try {
        // This screen used to query Supabase even under VITE_DEMO=1, and the
        // anon key cannot read `trees` - so demo mode showed "permission denied
        // for table trees" and an empty map. Every other screen has a DEMO
        // branch; this one was simply missed.
        const rows: MapTree[] = DEMO
          ? demoTrees.map((t) => ({
              ...t,
              last_wide_photo: t.latest?.wide_photo ?? null,
              thumb: null,
            }))
          : await (async () => {
              const { data, error: e } = await supabase
                .from('trees')
                .select(`*, checkins ( wide_photo, captured_at )`)
              if (e) throw new Error(e.message)

              type Row = Tree & {
                checkins: { wide_photo: string; captured_at: string }[]
              }
              return ((data ?? []) as unknown as Row[]).map((row): MapTree => {
                const latest = [...(row.checkins ?? [])].sort(
                  (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
                )[0]
                const { checkins: _drop, ...tree } = row
                return {
                  ...(tree as Tree),
                  last_wide_photo: latest?.wide_photo ?? null,
                  thumb: null,
                }
              })
            })()

        const paths = rows
          .map((r) => r.last_wide_photo)
          .filter((p): p is string => Boolean(p))
        if (paths.length) {
          const urls = await photoUrls(paths)
          for (const r of rows) {
            if (r.last_wide_photo) r.thumb = urls.get(r.last_wide_photo) ?? null
          }
        }
        setTrees(rows)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the map')
      }
    })()
  }, [])

  const shown = useMemo(
    () =>
      (trees ?? []).filter((t) => filter === 'all' || t.status === filter),
    [trees, filter],
  )

  const centre = useMemo<[number, number]>(() => {
    if (!trees || trees.length === 0) return FALLBACK_CENTRE
    return [
      trees.reduce((s, t) => s + t.lat, 0) / trees.length,
      trees.reduce((s, t) => s + t.lng, 0) / trees.length,
    ]
  }, [trees])

  return (
    <div className="px-margin-mobile py-stack-sm">
      <h1 className="mb-stack-sm font-headline text-headline-xl font-bold text-on-surface">
        Map
      </h1>
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-stack-sm flex flex-wrap gap-2">
        {[
          ['all', 'All'],
          ['alive', 'Verified'],
          ['pending', 'Unchecked'],
          ['flagged', 'Flagged'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value!)}
            className={`chip ${filter === value ? 'chip-verified' : 'chip-pending'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border-[1.5px] border-outline-variant">
        <MapContainer
          center={centre}
          zoom={17}
          style={{ height: '60dvh', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Recentre centre={centre} hasTrees={(trees?.length ?? 0) > 0} />

          {shown.map((t) => (
            <Marker
              key={t.id}
              position={[t.lat, t.lng]}
              icon={pinIcon(t.status)}
              title={treeLabel(t)}
            >
              <Popup>
                <div className="min-w-40">
                  {t.thumb && (
                    <img
                      src={t.thumb}
                      alt={`Most recent photo of ${treeLabel(t)}`}
                      className="mb-2 h-24 w-full rounded object-cover"
                    />
                  )}
                  <p className="font-bold">{treeLabel(t)}</p>
                  <p className="text-sm">{t.species || 'Species not recorded'}</p>
                  <div className="mt-1">
                    <StatusChip status={t.status} />
                  </div>
                  <Link to={`/tree/${t.id}`} className="mt-2 block font-semibold underline">
                    Open tree
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <p className="mt-stack-sm text-label-lg text-on-surface-variant">
        {trees === null
          ? 'Loading…'
          : `${shown.length} of ${trees.length} trees shown`}
      </p>
    </div>
  )
}

/** Move the view once real coordinates arrive, without fighting the user after. */
function Recentre({ centre, hasTrees }: { centre: [number, number]; hasTrees: boolean }) {
  const map = useMap()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (hasTrees && !done) {
      map.setView(centre, map.getZoom())
      setDone(true)
    }
  }, [centre, hasTrees, done, map])
  return null
}
