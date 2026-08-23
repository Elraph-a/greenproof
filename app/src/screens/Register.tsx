import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  GOOD_ACCURACY_M,
  MAX_ACCURACY_M,
  compassPoint,
  useGeolocation,
  useHeading,
} from '../lib/geo'
import { revokePreview, type PreparedPhoto } from '../lib/image'
import { submitRegistration } from '../lib/registrations'
import { nextTag } from '../lib/tags'
import {
  PROXIMITY_WARN_M,
  findTreesNear,
  treeLabel,
  type NearbyRegisteredTree,
} from '../lib/trees'
import { DEMO } from '../lib/demo'
import { Icon } from '../components/Icon'
import { PhotoCapture } from '../components/PhotoCapture'
import { TrunkMeasure, type TrunkTaps } from '../components/TrunkMeasure'
import { ErrorNote, Spinner } from '../components/ui'

/**
 * Register a tree — built to docs/design/v2/02-08.
 *
 * Five steps, each with the same frame: a title bar carrying "Step N of 5 —
 * <name>", a segmented progress bar, and a single primary action pinned to the
 * bottom where a thumb reaches.
 */

/** Speeds up T0 enormously — most of 40 trees will be a handful of species. */
const COMMON_SPECIES = [
  'Mango', 'Neem', 'Teak', 'Moringa', 'Cashew', 'Coconut', 'Avocado',
  'Orange', 'Banana', 'Plantain', 'Cassia', 'Mahogany', 'Acacia',
  'Oil palm', 'Papaya', 'Odum', 'Wawa', 'Ofram', 'Onyina',
]

const TOTAL = 5
const STEP_NAMES = ['GPS', 'Wide photo', 'Close-up', 'Details', 'Done']

/** Establishment GH₵5 + GH₵2 per later verified visit — see migration 0007. */
const POTENTIAL_FIRST_YEAR_GHS = 12

export function Register() {
  const { userId } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const { fix, state: geoState, reset: resetGeo } = useGeolocation(true)
  const { heading, state: headingState, request: requestHeading } = useHeading(true)

  const [wide, setWide] = useState<PreparedPhoto | null>(null)
  const [close, setClose] = useState<PreparedPhoto | null>(null)
  const [species, setSpecies] = useState('')
  const [tagCode, setTagCode] = useState('')

  /**
   * T0 baseline trunk width, and null for most trees on purpose.
   *
   * Only a SAMPLE is physically measured — roughly 20 of 40 at T0, tape-measured
   * alongside — so making this a required step would cost forty trees a pair of
   * taps to serve twenty. It lives collapsed inside step 4 rather than as a
   * sixth step for the same reason.
   *
   * It has to exist at T0 at all because the validation claim is "photo-derived
   * width vs tape measurement on the same visit". Starting at round 1 would
   * leave the T0 tape readings with nothing to compare against.
   */
  const [taps, setTaps] = useState<TrunkTaps | null>(null)

  /**
   * Frozen when the WIDE shutter is TAPPED — see PhotoCapture.onCaptureStart.
   * Reading it at submit time would record the direction the user happened to
   * be facing while typing, and the next visit would send them the wrong way.
   */
  const [capturedHeading, setCapturedHeading] = useState<number | null>(null)

  /**
   * Trees already registered where the user is standing.
   *
   * null = not looked yet, [] = looked and found nothing. The distinction
   * matters: we must not warn on an empty array we never populated.
   */
  const [collisions, setCollisions] = useState<NearbyRegisteredTree[] | null>(null)
  /** The user has looked at the photos and says it is a different tree. */
  const [collisionAck, setCollisionAck] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    return () => {
      if (wide) revokePreview(wide)
      if (close) revokePreview(close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accuracy = fix?.accuracy ?? null
  const gpsGood = accuracy !== null && accuracy <= GOOD_ACCURACY_M
  const gpsUsable = accuracy !== null && accuracy <= MAX_ACCURACY_M

  /**
   * Look for an existing tree at this spot, once per registration.
   *
   * Runs at STEP 1, before the two photos, because warning someone after they
   * have framed and shot a tree wastes the trip. Guarded on `collisions ===
   * null` because useGeolocation watches continuously — without that this
   * would re-query on every GPS refinement.
   *
   * A failure here sets [] rather than surfacing an error: not being able to
   * check must never block a registration. Degrade, don't break.
   */
  useEffect(() => {
    if (!fix || !gpsUsable || collisions !== null) return
    let cancelled = false
    void findTreesNear(fix.lat, fix.lng)
      .then((t) => !cancelled && setCollisions(t))
      .catch(() => !cancelled && setCollisions([]))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, gpsUsable, collisions])

  async function submit() {
    if (!userId) return
    setSubmitting(true)
    setError(null)
    try {
      // Demo mode never writes. The flow still completes so the design can be
      // reviewed end to end without touching Supabase or its storage quota.
      if (!DEMO) {
        if (!fix || !wide || !close) return
        await submitRegistration({
          userId,
          species: species.trim() || null,
          tagCode: tagCode.trim() || null,
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          heading: capturedHeading,
          // The blur gate cares about the close-up: it carries the trunk detail
          // the measurement and bark texture depend on.
          blurScore: close.blurScore,
          capturedAt: new Date(),
          wide: wide.blob,
          close: close.blob,
          trunkTaps: taps,
        })
      }
      setCount((n) => n + 1)
      setStep(5)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this tree')
    } finally {
      setSubmitting(false)
    }
  }

  function again() {
    if (wide) revokePreview(wide)
    if (close) revokePreview(close)
    setWide(null)
    setClose(null)
    // Must reset, or tree N+1 silently inherits tree N's trunk edges — the same
    // class of bug as the GPS fix below, and far harder to spot afterwards
    // because a plausible-looking width would be attached to the wrong tree.
    setTaps(null)
    // Species is deliberately KEPT and the tag advances by one. Most of a
    // forty-tree session is one species numbered in sequence, so clearing both
    // meant retyping the same word forty times with a phone in one hand. Both
    // remain editable on step 4.
    setTagCode((t) => nextTag(t))
    setCapturedHeading(null)
    setError(null)
    // Same reasoning as the GPS fix: a stale collision list would either warn
    // about the wrong place or, worse, stay silent at a spot never checked.
    setCollisions(null)
    setCollisionAck(false)
    // Critical: without this every tree after the first inherits tree #1's fix.
    resetGeo()
    setStep(1)
  }

  // An unresolved collision blocks step 1. Deliberately a speed bump and not a
  // hard block: GPS cannot tell two trees 3 m apart from one tree measured
  // twice, so refusing outright would make a dense grove unregisterable. The
  // PERSON decides, against the previous photo — the same layered-identity rule
  // the check-in flow uses.
  const collisionBlocking = Boolean(collisions?.length) && !collisionAck

  const canAdvance =
    step === 1
      ? (gpsUsable || DEMO) && !collisionBlocking
      : step === 2
        ? Boolean(wide)
        : step === 3
          ? Boolean(close)
          : true

  const PRIMARY: { label: string; go: () => void }[] = [
    { label: 'Record this position', go: () => setStep(2) },
    { label: 'Use this photo', go: () => setStep(3) },
    { label: 'Use this close-up', go: () => setStep(4) },
    { label: 'Register this tree', go: () => void submit() },
  ]
  const primary = PRIMARY[step - 1] ?? PRIMARY[0]!

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* ---- title bar ---------------------------------------------- */}
      <header className="safe-top sticky top-0 z-30 bg-background px-margin-mobile pt-3 pb-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={step === 1 || step === 5 ? 'Close' : 'Go back'}
            onClick={() =>
              step === 1 || step === 5 ? navigate('/grove') : setStep((s) => s - 1)
            }
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface active:bg-surface-container-high"
          >
            <Icon name={step === 1 || step === 5 ? 'x' : 'arrow-left'} size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="font-headline text-headline-lg font-bold text-on-surface">
              Register a Tree
            </h1>
            <p className="text-label-md text-on-surface-variant">
              Step {step} of {TOTAL} — {STEP_NAMES[step - 1]}
            </p>
          </div>
        </div>

        <div className="stepbar mt-3">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} data-on={i < step ? '1' : '0'} />
          ))}
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-label-lg font-semibold text-on-surface">
            {STEP_NAMES[step - 1]}
          </span>
          <span className="tnum text-label-lg text-on-surface-variant">
            {step} / {TOTAL}
          </span>
        </div>
      </header>

      <main className="flex-1 px-margin-mobile pb-3">
        {/* ---- 1 · GPS ----------------------------------------------- */}
        {step === 1 && (
          <GpsStep
            fix={fix}
            geoState={geoState}
            gpsGood={gpsGood}
            gpsUsable={gpsUsable}
            onRetry={resetGeo}
          />
        )}
        {step === 1 && !!collisions?.length && (
          <CollisionWarning
            trees={collisions}
            acked={collisionAck}
            onAck={() => setCollisionAck(true)}
            userId={userId}
            onCheckIn={(id) => navigate(`/checkin?tree=${id}`)}
          />
        )}

        {/* ---- 2 · wide photo ---------------------------------------- */}
        {step === 2 && (
          <>
            <InfoPanel
              icon="camera"
              title="Wide photo"
              body="Step back so the whole tree fits. Include the surroundings — sky, ground, and nearby plants."
            />
            <div className="mt-3">
              <PhotoCapture
                label="Wide photo"
                prompt="Tap to take photo"
                subPrompt="Hold phone portrait (upright)"
                photo={wide}
                onChange={setWide}
                onCaptureStart={() => setCapturedHeading(heading)}
                demoPhoto={1}
              />
            </div>
            {headingState === 'needs-permission' && (
              <button
                type="button"
                className="btn btn-outline btn-block mt-3"
                onClick={() => void requestHeading()}
              >
                <Icon name="compass" size={20} />
                Enable compass
              </button>
            )}
          </>
        )}

        {/* ---- 3 · close-up ------------------------------------------ */}
        {step === 3 && (
          <>
            <InfoPanel
              icon="target"
              title="Close-up of the trunk"
              body="Hold the printed reference card against the trunk. Fill the frame with trunk and card together. This is how the tree is measured later."
            />
            <div className="note-warn mt-2.5 flex items-center gap-2 py-2.5">
              <Icon name="ruler" size={16} className="shrink-0" />
              <span className="text-label-lg font-semibold">
                Hold reference card in shot for scale
              </span>
            </div>
            <div className="mt-3">
              <PhotoCapture
                label="Close-up"
                prompt="Tap to photograph trunk"
                subPrompt="Reference card must be in shot"
                brackets
                photo={close}
                onChange={setClose}
                demoPhoto={4}
              />
            </div>
          </>
        )}

        {/* ---- 4 · details ------------------------------------------- */}
        {step === 4 && (
          <>
            <div className="note-good">
              <p className="flex items-center gap-2 font-headline text-headline-md font-bold">
                <Icon name="check-circle" size={17} />
                Captured automatically
              </p>
              <dl className="mt-2.5 space-y-1.5 text-label-lg">
                <Row
                  icon="target"
                  label="Position"
                  value={
                    fix
                      ? `${fix.lat.toFixed(4)}° N, ${Math.abs(fix.lng).toFixed(4)}° W`
                      : DEMO
                        ? '5.6037° N, 0.1870° W'
                        : '—'
                  }
                />
                <Row
                  icon="ruler"
                  label="Accuracy"
                  value={fix ? `${fix.accuracy.toFixed(1)} m` : DEMO ? '6.7 m' : '—'}
                />
                <Row
                  icon="compass"
                  label="Facing"
                  value={
                    capturedHeading !== null
                      ? `${compassPoint(capturedHeading)} ${Math.round(capturedHeading)}°`
                      : DEMO
                        ? 'NNE 23°'
                        : 'no compass'
                  }
                />
                <Row
                  icon="camera"
                  label="Photos"
                  value="2 captured (wide + close-up)"
                />
              </dl>
            </div>

            <div className="mt-stack-md">
              <label className="label" htmlFor="species">Species</label>
              <input
                id="species"
                className="field"
                list="species-list"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder="Select or search species"
              />
              <datalist id="species-list">
                {COMMON_SPECIES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div className="mt-stack-md">
              <label className="label" htmlFor="tag">
                Tag number <span className="font-normal text-on-surface-variant">(optional)</span>
              </label>
              {/* The most important honesty point in the product, stated where
                  the user actually is rather than buried in a slide. */}
              <p className="mb-2 text-label-lg text-on-surface-variant">
                If you placed a physical tag on the tree, enter its number here.
                This helps you find the tree again — it is not how the tree is
                identified.
              </p>
              <div className="flex items-center gap-2">
                <Icon name="list" size={17} className="shrink-0 text-on-surface-variant" />
                <input
                  id="tag"
                  className="field"
                  value={tagCode}
                  onChange={(e) => setTagCode(e.target.value)}
                  placeholder="e.g. GP-0041"
                />
              </div>
            </div>

            {/* Collapsed, and optional, on purpose. Only a SAMPLE of trees is
                tape-measured at T0 — about twenty of forty — so making this a
                required sixth step would cost every tree a pair of taps to
                serve half of them. Closed by default it costs the other twenty
                nothing; the surveyor carrying the tape opens it.

                It has to exist at T0 rather than from round 1 because the
                validation claim is "photo-derived width vs tape measurement on
                the same visit". Without a T0 baseline the tape readings taken
                that day have nothing to compare against. */}
            {close && (
              <details className="disclosure mt-stack-md">
                <summary>
                  Measure the trunk{' '}
                  <span className="font-normal text-on-surface-variant">
                    {taps ? '· marked' : '· optional'}
                  </span>
                </summary>
                <div className="disclosure-body">
                  <p className="mb-2.5 text-label-lg text-on-surface-variant">
                    Only needed on trees you are also measuring with a tape.
                    Tap the two edges of the trunk at about 1.3 m from the
                    ground — chest height — which is where trunk diameter is
                    measured everywhere in forestry.
                  </p>
                  <TrunkMeasure
                    imageUrl={close.previewUrl}
                    taps={taps}
                    onChange={setTaps}
                  />
                </div>
              </details>
            )}

            {capturedHeading === null && !DEMO && (
              // Degrade, don't break: a missing signal lowers confidence later,
              // it does not stop the registration.
              <div className="note-warn mt-stack-md">
                <p className="text-label-lg font-medium">
                  No compass reading on this device. The tree still registers —
                  the next visit just won't be able to say "face this way".
                </p>
              </div>
            )}

            {error && <ErrorNote>{error}</ErrorNote>}
          </>
        )}

        {/* ---- 5 · done ---------------------------------------------- */}
        {step === 5 && (
          <div className="flex flex-col items-center pt-stack-lg text-center">
            <span className="flex size-[72px] items-center justify-center rounded-full bg-[var(--color-verified-container)] text-[var(--color-verified)]">
              <Icon name="check-circle" size={40} />
            </span>
            <h2 className="mt-stack-md font-headline text-headline-xl font-bold text-on-surface">
              Tree registered
            </h2>
            <p className="mt-2 max-w-[280px] text-on-surface-variant">
              Your tree has been recorded. It will show as "Not checked" until
              your first verification check-in.
            </p>

            <div className="mt-stack-md flex w-full items-start gap-3 rounded-xl bg-accent-container p-4 text-left">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Icon name="wallet" size={17} />
              </span>
              <div>
                <p className="text-label-lg text-on-accent-container/80">
                  Potential earning
                </p>
                <p className="tnum font-headline text-headline-md font-bold text-on-accent-container">
                  GH₵{POTENTIAL_FIRST_YEAR_GHS.toFixed(2)} after first verified check-in
                </p>
              </div>
            </div>

            {count > 1 && (
              <p className="mt-stack-md text-on-surface-variant">
                {count} trees this session
              </p>
            )}
          </div>
        )}
      </main>

      {/* ---- pinned action ------------------------------------------ */}
      <footer className="safe-bottom sticky bottom-0 bg-background px-margin-mobile pt-2">
        {step === 5 ? (
          <>
            {/* Primary, because they are standing in a field with 39 to go. */}
            <button type="button" className="btn btn-primary btn-block" onClick={again}>
              <Icon name="plus" size={19} />
              Register another tree
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block mt-2"
              onClick={() => navigate('/grove')}
            >
              View My Grove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!canAdvance || submitting}
            onClick={primary.go}
          >
            {submitting ? <Spinner /> : primary.label}
          </button>
        )}
      </footer>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * "There is already a tree registered here."
 *
 * THE BUG THIS FIXES: at the pilot one physical tree was photographed twice and
 * became two tree rows. Nothing objected, because nothing looked. Two rows for
 * one trunk means the tree is paid for twice, which is the double-payment case
 * in the attack set — arrived at by honest accident rather than by fraud, which
 * is how it will usually arrive.
 *
 * WHY IT SHOWS PHOTOS RATHER THAN JUST A DISTANCE. GPS at 5-10 m accuracy
 * genuinely cannot separate "one tree measured twice" from "two trees 3 m
 * apart". The previous WIDE SHOT can, instantly, because a person looking at it
 * knows whether they are standing in front of that tree. Same rule as check-in:
 * GPS narrows the candidates, the person decides.
 */
function CollisionWarning({
  trees,
  acked,
  userId,
  onAck,
  onCheckIn,
}: {
  trees: NearbyRegisteredTree[]
  acked: boolean
  userId: string | null
  onAck: () => void
  onCheckIn: (id: string) => void
}) {
  return (
    <div className="note-warn mt-3">
      <p className="flex items-center gap-2 font-headline text-headline-md font-bold">
        <Icon name="warning" size={17} />
        {trees.length === 1
          ? 'A tree is already registered here'
          : `${trees.length} trees are already registered here`}
      </p>
      <p className="mt-1.5 text-label-lg">
        Look at the last photo. If it is the tree in front of you, check it in
        instead — registering it again would pay for one tree twice.
      </p>

      <ul className="mt-2.5 space-y-2">
        {trees.map((t) => {
          const mine = userId !== null && t.owner_id === userId
          return (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg bg-surface-container-lowest p-2.5"
            >
              {t.last_wide_url ? (
                <img
                  src={t.last_wide_url}
                  alt=""
                  className="size-14 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-container text-on-surface-variant">
                  <Icon name="camera" size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-on-surface">
                  {treeLabel(t)}
                </p>
                <p className="tnum text-label-lg text-on-surface-variant">
                  {t.distance_m.toFixed(1)} m away
                  {t.species ? ` · ${t.species}` : ''}
                </p>
              </div>
              {mine ? (
                <button
                  type="button"
                  className="btn btn-outline shrink-0 px-4"
                  onClick={() => onCheckIn(t.id)}
                >
                  Check in
                </button>
              ) : (
                // Someone else's tree. Checking in on their behalf is not
                // offered — that would be submitting evidence for a tree that
                // is not yours, which is the thing the ownership model exists
                // to prevent. Registering anyway is allowed and gets reviewed.
                <span className="shrink-0 text-label-md text-on-surface-variant">
                  another
                  <br />
                  planter
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {!acked && (
        <button
          type="button"
          className="btn btn-outline btn-block mt-2.5"
          onClick={onAck}
        >
          This is a different tree
        </button>
      )}
      {acked && (
        <p className="mt-2.5 flex items-center gap-2 text-label-lg font-semibold text-on-surface">
          <Icon name="check-circle" size={16} />
          Marked as a different tree — this registration is flagged for review.
        </p>
      )}
      <p className="mt-1.5 text-label-md text-on-surface-variant">
        Within {PROXIMITY_WARN_M} m of this position.
      </p>
    </div>
  )
}

function GpsStep({
  fix,
  geoState,
  gpsGood,
  gpsUsable,
  onRetry,
}: {
  fix: { lat: number; lng: number; accuracy: number } | null
  geoState: string
  gpsGood: boolean
  gpsUsable: boolean
  onRetry: () => void
}) {
  // In demo mode there is no GPS on a desktop, so show a representative
  // marginal fix — the state worth reviewing, since the good one is trivial.
  const shown = fix ?? (DEMO ? { lat: 5.6037, lng: -0.187, accuracy: 7 } : null)
  const good = fix ? gpsGood : DEMO ? false : false
  const usable = fix ? gpsUsable : DEMO ? true : false

  const tone = good ? 'good' : usable ? 'warn' : 'bad'
  const ring =
    tone === 'good'
      ? 'text-[var(--color-verified)]'
      : tone === 'warn'
        ? 'text-accent'
        : 'text-error'

  return (
    <div className="flex flex-col items-center pt-stack-md">
      {/* Suppressed in demo mode: a desktop browser denies geolocation, and the
          synthetic fix below is what we want to review. */}
      {geoState === 'denied' && !DEMO && (
        <ErrorNote>
          Location permission was refused. A tree cannot be registered without
          it — allow location in your browser settings and reload.
        </ErrorNote>
      )}
      {geoState === 'unavailable' && !DEMO && (
        <ErrorNote>
          This device can't provide location. It needs an HTTPS page — check you
          are on the real site address.
        </ErrorNote>
      )}

      {/* Concentric target. The rings are decorative, but the colour is not:
          it is the same green / amber / red the accuracy legend uses. */}
      <div className={`relative flex size-[168px] items-center justify-center ${ring}`}>
        <span className="absolute inset-0 rounded-full bg-current opacity-[0.06]" />
        <span className="absolute inset-[26px] rounded-full border-2 border-current opacity-30" />
        <span className="absolute inset-[52px] rounded-full border-2 border-current opacity-55" />
        <Icon name="target" size={30} />
      </div>

      {!shown ? (
        <div className="mt-stack-md flex items-center gap-3">
          <Spinner className="text-primary" />
          <span className="font-medium text-on-surface">Finding your position…</span>
        </div>
      ) : (
        <>
          <p className={`tnum mt-stack-md font-headline text-display-md font-bold ${ring}`}>
            {Math.round(shown.accuracy)} m
          </p>

          <span
            className={`chip mt-3 ${
              tone === 'good' ? 'chip-verified' : tone === 'warn' ? 'chip-review' : 'chip-flagged'
            }`}
          >
            {tone === 'good'
              ? 'Good — position recorded'
              : tone === 'warn'
                ? 'Marginal — move to open sky'
                : 'Too poor — wait or move to open sky'}
          </span>

          <p className="mt-2.5 text-label-lg text-on-surface-variant">
            {usable ? 'Signal locked. Ready to record.' : 'Waiting for a better fix.'}
          </p>
        </>
      )}

      {/* The legend. Accuracy is the one number that decides whether two
          neighbouring trees can be told apart at the next visit, so the
          thresholds are shown rather than hidden behind a verdict. */}
      <dl className="card-flat mt-stack-md w-full space-y-2 text-label-lg">
        <Legend tone="good" range="≤ 5 m" text="Good — position recorded" />
        <Legend tone="warn" range="5–15 m" text="Marginal — acceptable but move if you can" />
        <Legend tone="bad" range="> 15 m" text="Too poor — wait or move to open sky" />
      </dl>

      {shown && !good && !DEMO && (
        /*
          useGeolocation keeps the TIGHTEST fix seen, which is right while
          converging but means one early bad reading can pin the display until
          the 30 s staleness window expires. Without this the user's only
          options at ±40 m are to wait or abandon the tree.
        */
        <button type="button" className="btn btn-outline btn-block mt-3" onClick={onRetry}>
          <Icon name="refresh" size={18} />
          Start the fix again
        </button>
      )}
    </div>
  )
}

function Legend({
  tone,
  range,
  text,
}: {
  tone: 'good' | 'warn' | 'bad'
  range: string
  text: string
}) {
  const dot =
    tone === 'good'
      ? 'bg-[var(--color-verified)]'
      : tone === 'warn'
        ? 'bg-accent'
        : 'bg-error'
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
      <dt className="tnum w-14 shrink-0 font-semibold text-on-surface">{range}</dt>
      <dd className="text-on-surface-variant">{text}</dd>
    </div>
  )
}

function InfoPanel({
  icon,
  title,
  body,
}: {
  icon: 'camera' | 'target'
  title: string
  body: string
}) {
  return (
    <div className="note mt-1 flex gap-3">
      <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-on-surface" />
      <div>
        <p className="font-headline text-headline-md font-bold text-on-surface">
          {title}
        </p>
        <p className="mt-1 text-label-lg text-on-surface-variant">{body}</p>
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: 'target' | 'ruler' | 'compass' | 'camera'
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={14} className="shrink-0 opacity-70" />
      <dt className="w-[68px] shrink-0 opacity-80">{label}</dt>
      <dd className="tnum font-semibold">{value}</dd>
    </div>
  )
}
