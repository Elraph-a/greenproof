import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { photoUrls } from '../lib/photos'
import { treeLabel } from '../lib/trees'
import type { Tree } from '../lib/types'
import { ErrorNote, StatusChip } from '../components/ui'

/**
 * Live map of every registered tree.
 *
 * Uses CircleMarker rather than Leaflet's default pin deliberately: the default
 * icon is loaded from an image URL that Vite's bundler rewrites, which is the
 * single most common react-leaflet deployment bug — markers work in dev and
 * silently vanish in production. A vector circle has no asset to lose, and it
 * also colours by status for free, which a bitmap pin cannot.
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
  alive: '#00694e', // --color-verified
  pending: '#6b7c73', // --color-outline
  flagged: '#b3261e', // --color-error
  dead: '#b3261e',
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
        const { data, error: e } = await supabase
          .from('trees')
          .select(`*, checkins ( wide_photo, captured_at )`)
        if (e) throw new Error(e.message)

        type Row = Tree & { checkins: { wide_photo: string; captured_at: string }[] }
        const rows = ((data ?? []) as unknown as Row[]).map((row): MapTree => {
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
            <CircleMarker
              key={t.id}
              center={[t.lat, t.lng]}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: STATUS_COLOUR[t.status] ?? STATUS_COLOUR['pending']!,
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="min-w-40">
                  {t.thumb && (
                    <img
                      src={t.thumb}
                      alt=""
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
            </CircleMarker>
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
