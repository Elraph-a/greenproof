import { useId, useMemo, useState } from 'react'

/**
 * Survival rate over time — the sponsor's actual question, which is not "how
 * many trees did you plant" but "how many are still alive".
 *
 * ONE SERIES, so there is no legend: the title names it, and a legend box for a
 * single line is furniture. Colour therefore carries no identity here and needs
 * no categorical-palette validation — it only has to clear contrast against the
 * surface, which --color-primary (#003527 on #f9f9ff) does by a wide margin.
 *
 * A table view is rendered alongside rather than instead: it is the
 * accessibility fallback, and for a five-point pilot series the exact numbers
 * are genuinely more useful to a judge than the shape.
 */

export interface SurvivalPoint {
  date: string // ISO
  alive: number
  total: number
}

interface Props {
  points: SurvivalPoint[]
  height?: number
}

const PAD = { top: 16, right: 16, bottom: 28, left: 36 }

export function SurvivalCurve({ points, height = 200 }: Props) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = height

  const data = useMemo(
    () =>
      points
        .filter((p) => p.total > 0)
        .map((p) => ({ ...p, pct: (p.alive / p.total) * 100 }))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    [points],
  )

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-on-surface-variant">
        No check-in rounds yet — the curve appears after the first round.
      </p>
    )
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // Y always spans 0-100: a sponsor comparing two groves needs a fixed scale,
  // and auto-scaling a survival rate to its own min/max makes a drop from 98%
  // to 96% look like a collapse.
  const x = (i: number) =>
    PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (pct: number) => PAD.top + innerH - (pct / 100) * innerH

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.pct)}`).join(' ')
  const last = data[data.length - 1]!

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-labelledby={`${id}-t`}
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-t`}>
          Survival rate over time, {Math.round(last.pct)} percent at the latest
          round
        </title>

        {/* Recessive gridlines. */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-outline-variant)"
              strokeWidth={1}
              opacity={v === 0 ? 1 : 0.5}
            />
            <text
              x={PAD.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-on-surface-variant)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* 2px line, no fill — an area under a percentage implies a cumulative
            total, which this is not. */}
        <path
          d={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((d, i) => (
          <g key={d.date}>
            {/* Hit target larger than the mark. */}
            <circle
              cx={x(i)}
              cy={y(d.pct)}
              r={16}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
            />
            <circle
              cx={x(i)}
              cy={y(d.pct)}
              r={hover === i ? 6 : 4.5}
              fill="var(--color-primary)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
            <text
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--color-on-surface-variant)"
            >
              {new Date(d.date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </text>
          </g>
        ))}

        {/* Direct-label the last point only — a number on every point is noise. */}
        <text
          x={x(data.length - 1)}
          y={y(last.pct) - 12}
          textAnchor="end"
          fontSize="13"
          fontWeight="700"
          fill="var(--color-on-surface)"
        >
          {Math.round(last.pct)}%
        </text>

        {hover !== null && data[hover] && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--color-outline)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <rect
              x={Math.min(x(hover) + 8, W - 130)}
              y={y(data[hover]!.pct) - 34}
              width={122}
              height={30}
              rx={4}
              fill="var(--color-inverse-surface)"
            />
            <text
              x={Math.min(x(hover) + 16, W - 122)}
              y={y(data[hover]!.pct) - 14}
              fontSize="12"
              fill="var(--color-inverse-on-surface)"
            >
              {data[hover]!.alive}/{data[hover]!.total} alive ·{' '}
              {Math.round(data[hover]!.pct)}%
            </text>
          </g>
        )}
      </svg>

      <figcaption className="sr-only">
        Survival rate by check-in round.
      </figcaption>

      {/* Table view — the accessibility fallback, and for a five-point pilot
          the exact counts matter more than the shape. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-label-lg font-bold text-on-surface-variant">
          Show the numbers
        </summary>
        <table className="mt-2 w-full text-label-lg">
          <thead>
            <tr className="border-b border-outline-variant text-on-surface-variant">
              <th className="py-1 text-left font-bold">Round</th>
              <th className="py-1 text-right font-bold">Alive</th>
              <th className="py-1 text-right font-bold">Total</th>
              <th className="py-1 text-right font-bold">Survival</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-b border-outline-variant/50">
                <td className="py-1">
                  {new Date(d.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </td>
                <td className="py-1 text-right">{d.alive}</td>
                <td className="py-1 text-right">{d.total}</td>
                <td className="py-1 text-right font-bold">{Math.round(d.pct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
