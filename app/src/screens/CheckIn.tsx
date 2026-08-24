import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { MAX_ACCURACY_M, compassPoint, useGeolocation, useHeading } from '../lib/geo'
import { revokePreview, type PreparedPhoto } from '../lib/image'
import { photoUrl } from '../lib/photos'
import {
  findNearbyTrees,
  latestCheckin,
  submitCheckin,
  waitForVerdict,
  type NearbyTree,
} from '../lib/checkins'
import { treeLabel } from '../lib/trees'
import { DEMO, demoCommonName } from '../lib/demo'
import type { Checkin } from '../lib/types'
import { Icon } from '../components/Icon'
import { FaceThisWay } from '../components/FaceThisWay'
import { GhostCamera } from '../components/GhostCamera'
import { TrunkMeasure, type TrunkTaps } from '../components/TrunkMeasure'
import { VerdictReveal } from '../components/VerdictReveal'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * Check in on a tree - built to docs/design/v2/09-12.
 *
 * Three named stages (Position → Photo → Measure) shown as a connected rail,
 * preceded by a tree picker and followed by the verdict reveal. The rail is
 * labelled rather than numbered because the three stages are genuinely
 * different tasks, and "step 2 of 3" tells a user standing at a tree nothing
 * about what they are about to be asked to do.
 */

const STAGES = ['Position', 'Photo', 'Measure'] as const

export function CheckIn() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preselect = params.get('tree')

  const [step, setStep] = useState(1)
  const { fix, state: geoState } = useGeolocation(true)
  const { heading, state: headingState, request: requestHeading } = useHeading(true)

  const [nearby, setNearby] = useState<NearbyTree[] | null>(null)
  const [tree, setTree] = useState<NearbyTree | null>(null)
  const [ghostUrl, setGhostUrl] = useState<string | null>(null)

  const [wide, setWide] = useState<PreparedPhoto | null>(null)
  const [close, setClose] = useState<PreparedPhoto | null>(null)
  const [taps, setTaps] = useState<TrunkTaps | null>(null)
  const [capturedHeading, setCapturedHeading] = useState<number | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [verdict, setVerdict] = useState<Checkin | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || nearby) return
    if (!fix && !DEMO) return
    findNearbyTrees(userId, fix?.lat ?? 5.6505, fix?.lng ?? -0.1962)
      .then(async (rows) => {
        setNearby(rows)
        const pre = preselect ? rows.find((r) => r.id === preselect) : undefined
        if (pre) await choose(pre)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not find trees'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fix, nearby, preselect])

  useEffect(() => {
    return () => {
      if (wide) revokePreview(wide)
      if (close) revokePreview(close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function choose(t: NearbyTree) {
    setTree(t)
    // The previous wide shot becomes the ghost overlay. No previous visit means
    // no overlay - the flow still works, it just loses the alignment aid.
    const prev = await latestCheckin(t.id)
    setGhostUrl(prev ? await photoUrl(prev.wide_photo) : null)
    setStep(2)
  }

  async function submit() {
    if (!userId || !tree) return
    setSubmitting(true)
    setError(null)
    setStep(5)
    try {
      const id = await submitCheckin({
        userId,
        treeId: tree.id,
        lat: fix?.lat ?? 5.6505,
        lng: fix?.lng ?? -0.1962,
        accuracy: fix?.accuracy ?? null,
        heading: capturedHeading,
        blurScore: close?.blurScore ?? null,
        capturedAt: new Date(),
        wide: wide?.blob ?? new Blob(),
        close: close?.blob ?? new Blob(),
        trunkTaps: taps,
      })
      const row = await waitForVerdict(id)
      if (row) setVerdict(row)
      else setTimedOut(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit')
    } finally {
      setSubmitting(false)
    }
  }

  const gpsUsable = DEMO || (fix !== null && fix.accuracy <= MAX_ACCURACY_M)
  const treeName = tree ? (demoCommonName.get(tree.id) ?? treeLabel(tree)) : ''
  const distance = tree ? Math.round(tree.distance_m) : null

  /* ---- the verdict reveal is its own full screen ---------------------- */
  if (step === 5) {
    return (
      <VerdictReveal
        checkin={verdict}
        timedOut={timedOut}
        error={error}
        treeName={treeName}
        tagCode={tree?.tag_code ?? null}
        // Re-runs the SAME submission. submit() reads wide/close/taps straight
        // from state and never clears them, so the photos captured at the tree
        // are reused rather than re-shot.
        onRetry={() => void submit()}
        onAgain={() => {
          setStep(1)
          setNearby(null)
          setTree(null)
          setWide(null)
          setClose(null)
          setTaps(null)
          setVerdict(null)
        }}
        onDone={() => navigate(tree ? `/tree/${tree.id}` : '/grove')}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* ---- title bar ---------------------------------------------- */}
      <header className="safe-top sticky top-0 z-30 bg-background px-margin-mobile pt-3 pb-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => (step === 1 ? navigate('/grove') : setStep((s) => s - 1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface active:bg-surface-container-high"
          >
            <Icon name="arrow-left" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-headline text-headline-lg font-bold text-on-surface">
              Check-In
            </h1>
            {tree && (
              <p className="truncate text-label-md text-on-surface-variant">
                {treeName}
                {tree.tag_code ? ` · ${tree.tag_code}` : ''}
              </p>
            )}
          </div>
          {distance !== null && (
            <span className="chip chip-verified shrink-0">
              <Icon name="target" size={12} />
              {distance} m away
            </span>
          )}
        </div>

        {step > 1 && <StageRail active={step - 1} />}
      </header>

      <main className="flex-1 px-margin-mobile pb-3">
        {/* --- 1 · which tree ---------------------------------------- */}
        {step === 1 && (
          <div className="pt-1">
            <h2 className="font-headline text-headline-lg font-bold text-on-surface">
              Which tree?
            </h2>
            <p className="mt-1 mb-stack-sm text-on-surface-variant">
              Trees near you, closest first. Check the photo matches what you're
              standing in front of.
            </p>

            {geoState === 'denied' && !DEMO && (
              <ErrorNote>
                Location permission was refused, so we can't tell which trees are
                near you.
              </ErrorNote>
            )}

            {!fix && !DEMO && geoState !== 'denied' && (
              <div className="card flex items-center gap-3">
                <Spinner className="text-primary" />
                <span className="font-medium">Finding your position…</span>
              </div>
            )}

            {fix && !gpsUsable && (
              <ErrorNote>
                GPS accuracy is only ±{Math.round(fix.accuracy)} m. Move into the
                open. At this accuracy we cannot tell neighbouring trees apart.
              </ErrorNote>
            )}

            {nearby?.length === 0 && (
              <div className="card">
                <p className="font-bold text-on-surface">No trees within 100 m</p>
                <p className="mt-1 text-on-surface-variant">
                  Either you're not at the right place, or this tree was
                  registered by someone else.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {nearby?.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void choose(t)}
                  disabled={!gpsUsable}
                  className="card flex w-full items-center gap-3 text-left active:bg-surface-container-low disabled:opacity-50"
                >
                  <div className="size-[62px] shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                    {t.last_wide_url ? (
                      <img
                        src={t.last_wide_url}
                        // NOT decorative. Confirming this tree against its
                        // previous photo IS the identity step - see the
                        // layered-identity note in lib/checkins.ts. A blank
                        // alt hides the one piece of evidence the user is
                        // being asked to judge.
                        alt={`Last photo of ${treeLabel(t)}`}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-on-surface-variant">
                        <Icon name="image" size={22} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-headline text-headline-md font-bold text-on-surface">
                      {demoCommonName.get(t.id) ?? treeLabel(t)}
                    </p>
                    <p className="truncate text-label-lg text-on-surface-variant italic">
                      {t.species || 'Species not recorded'}
                    </p>
                    <p className="tnum mt-1 text-label-lg font-semibold text-[var(--color-verified)]">
                      {Math.round(t.distance_m)} m away
                    </p>
                  </div>
                  <Icon name="chevron-right" size={18} className="text-on-surface-variant" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --- 2 · position ------------------------------------------ */}
        {step === 2 && tree && (
          <div className="pt-1">
            <h2 className="font-headline text-headline-lg font-bold text-on-surface">
              Find your position
            </h2>
            <p className="mt-1 mb-stack-sm text-on-surface-variant">
              Stand at the marked spot and face this direction
            </p>

            <FaceThisWay target={tree.heading_deg} current={heading} />

            <div className="note mt-stack-md flex gap-2.5">
              <Icon name="clock" size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <p className="text-label-lg text-on-surface-variant">
                Last photo was taken from about 8 m from the trunk, facing{' '}
                {tree.heading_deg !== null ? compassPoint(tree.heading_deg) : 'the same way'}.
                Stand in roughly the same spot. Reproducing the framing is what
                makes the photo comparison work.
              </p>
            </div>

            {headingState === 'needs-permission' && (
              <button
                type="button"
                className="btn btn-outline btn-block mt-3"
                onClick={() => void requestHeading()}
              >
                <Icon name="compass" size={18} />
                Enable compass
              </button>
            )}
          </div>
        )}

        {/* --- 3 · wide with ghost overlay --------------------------- */}
        {step === 3 && (
          <div className="pt-1">
            <h2 className="font-headline text-headline-lg font-bold text-on-surface">
              Photograph the tree
            </h2>
            <p className="mt-1 mb-3 text-on-surface-variant">
              Align with the ghost image, then capture
            </p>

            {wide ? (
              <div className="relative overflow-hidden rounded-2xl">
                <img
                  src={wide.previewUrl}
                  alt="Wide photo"
                  className="block aspect-[3/4] w-full object-cover"
                />
                <button
                  type="button"
                  className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-label-lg font-semibold text-white backdrop-blur"
                  onClick={() => {
                    revokePreview(wide)
                    setWide(null)
                  }}
                >
                  <Icon name="refresh" size={14} />
                  Retake
                </button>
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-verified)] px-3 py-1.5 text-label-md font-bold text-white">
                  <Icon name="check-circle" size={14} />
                  Photo captured
                </span>
              </div>
            ) : (
              <GhostCamera
                ghostUrl={ghostUrl}
                label="Wide photo"
                instruction={
                  ghostUrl
                    ? 'Ghost: previous photo, align your shot'
                    : 'No previous photo to align against'
                }
                onCaptureStart={() => setCapturedHeading(heading)}
                onCapture={setWide}
              />
            )}
          </div>
        )}

        {/* --- 4 · close-up + measurement ---------------------------- */}
        {step === 4 && (
          <div className="pt-1">
            <h2 className="font-headline text-headline-lg font-bold text-on-surface">
              Measure the trunk
            </h2>
            <p className="mt-1 mb-3 text-on-surface-variant">
              Tap the left edge then the right edge of the trunk
            </p>

            {close ? (
              <>
                {taps && (
                  <div className="note-good mb-3 flex items-center gap-2 py-2.5">
                    <Icon name="check-circle" size={16} className="shrink-0" />
                    <span className="flex-1 text-label-lg font-semibold">
                      Width recorded. Confirm below
                    </span>
                    <button
                      type="button"
                      onClick={() => setTaps(null)}
                      className="rounded-full bg-white/70 px-2.5 py-1 text-label-md font-bold"
                    >
                      Redo
                    </button>
                  </div>
                )}

                <TrunkMeasure imageUrl={close.previewUrl} taps={taps} onChange={setTaps} />

                <button
                  type="button"
                  className="btn btn-secondary btn-block mt-3"
                  onClick={() => {
                    revokePreview(close)
                    setClose(null)
                    setTaps(null)
                  }}
                >
                  <Icon name="refresh" size={17} />
                  Retake photo
                </button>

                {!taps && (
                  <div className="note mt-3">
                    <p className="text-label-lg text-on-surface-variant">
                      You can submit without measuring. The visit still counts.
                      The growth check just won't have anything to compare.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <GhostCamera
                ghostUrl={null}
                label="Close-up"
                instruction="Trunk at chest height, marker card flat against it"
                onCapture={setClose}
              />
            )}
          </div>
        )}
      </main>

      {/* ---- pinned action ------------------------------------------ */}
      {step > 1 && (
        <footer className="safe-bottom sticky bottom-0 bg-background px-margin-mobile pt-2">
          {step === 2 && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setStep(3)}
            >
              I'm in position. Take photo
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!wide}
              onClick={() => setStep(4)}
            >
              Continue to measurement
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!close || submitting}
              onClick={() => void submit()}
            >
              {submitting ? <Spinner /> : 'Submit check-in'}
            </button>
          )}
        </footer>
      )}
    </div>
  )
}

/** Position → Photo → Measure, as a connected rail with completed ticks. */
function StageRail({ active }: { active: number }) {
  return (
    <ol className="mt-3 flex items-start">
      {STAGES.map((name, i) => {
        const done = i < active - 1
        const now = i === active - 1
        return (
          <li key={name} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span
                className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : done || now ? 'bg-primary' : 'bg-surface-container-high'}`}
              />
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  done
                    ? 'border-primary bg-primary text-on-primary'
                    : now
                      ? 'border-primary bg-primary-container text-primary'
                      : 'border-surface-container-high bg-surface-container text-on-surface-variant'
                }`}
              >
                <Icon
                  name={done ? 'check' : i === 0 ? 'compass' : i === 1 ? 'camera' : 'ruler'}
                  size={14}
                />
              </span>
              <span
                className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? 'opacity-0' : done ? 'bg-primary' : 'bg-surface-container-high'}`}
              />
            </div>
            <span
              className={`mt-1 text-micro ${now ? 'font-bold text-primary' : 'text-on-surface-variant'}`}
            >
              {name}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
