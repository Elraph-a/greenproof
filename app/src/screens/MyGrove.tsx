import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { photoUrls } from '../lib/photos'
import {
  formatAge,
  listMyTrees,
  nextCheckinDue,
  treeLabel,
  type TreeWithLatest,
} from '../lib/trees'
import { supabase } from '../lib/supabase'
import { DEMO, demoCommonName, demoLedger } from '../lib/demo'
import { Icon } from '../components/Icon'
import {
  EmptyState,
  ErrorNote,
  HeroBadge,
  HeroCard,
  PhotoHero,
  StatusChip,
} from '../components/ui'

/**
 * My Grove — built to docs/design/v2/01-my-grove.png.
 *
 * Structure, top to bottom: a dated greeting, three stat cards, a survival bar,
 * filter pills, then the tree list. The date header is not decoration — during
 * a check-in round the question "did I already do these today?" is the most
 * common one, and the answer is the first thing on the screen.
 */

type Filter = 'all' | 'verified' | 'review' | 'flagged'

export function MyGrove() {
  const { userId, profile } = useAuth()
  const [trees, setTrees] = useState<TreeWithLatest[] | null>(null)
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const rows = await listMyTrees(userId)
      setTrees(rows)
      const paths = rows
        .map((t) => t.latest?.wide_photo)
        .filter((p): p is string => Boolean(p))
      if (paths.length) setThumbs(await photoUrls(paths))

      if (DEMO) {
        setBalance(demoLedger.reduce((s, e) => s + Number(e.amount_ghs), 0))
        return
      }
      const { data } = await supabase
        .from('ledger_entries')
        .select('amount_ghs')
        .eq('user_id', userId)
      setBalance(
        (data ?? []).reduce((s, e) => s + Number(e.amount_ghs ?? 0), 0),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your trees')
    }
  }, [userId])

  useEffect(() => {
    void load()
    // Trees appear once the offline queue drains, so re-poll while visible.
    const t = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(t)
  }, [load])

  const counts = useMemo(() => {
    const list = trees ?? []
    return {
      all: list.length,
      verified: list.filter((t) => t.latest?.verdict === 'verified').length,
      review: list.filter((t) => t.latest?.verdict === 'review').length,
      flagged: list.filter((t) => t.latest?.verdict === 'flagged').length,
    }
  }, [trees])

  const shown = useMemo(() => {
    const list = trees ?? []
    if (filter === 'all') return list
    return list.filter((t) => t.latest?.verdict === filter)
  }, [trees, filter])

  /**
   * Two groups, because a grove list is a work list.
   *
   * A flat list of forty trees sorted by nothing forces the planter to read
   * every row to find the three that need walking to. Splitting on "is this
   * due?" puts the work at the top and turns the rest into a receipt. Only
   * applied on the unfiltered view - once someone has picked "Flagged", the
   * grouping would be answering a question they did not ask.
   */
  const grouped = useMemo(() => {
    if (filter !== 'all') return null
    const due: TreeWithLatest[] = []
    const done: TreeWithLatest[] = []
    for (const t of shown) {
      const d = t.latest ? nextCheckinDue(t.latest.captured_at) : null
      ;(d?.overdue ?? !t.latest ? due : done).push(t)
    }
    return { due, done }
  }, [shown, filter])

  const alive = trees?.filter((t) => t.status === 'alive').length ?? 0
  const survival = trees && trees.length ? Math.round((alive / trees.length) * 100) : 0

  /* Trees whose next check-in has come due. This is the only number on the
     screen that is an instruction rather than a result, which is why it earns
     a place in the strip over "trees registered" (already implied by the hero
     reading "4 of 8"). */
  const dueCount = useMemo(
    () =>
      (trees ?? []).filter((t) => {
        const d = t.latest ? nextCheckinDue(t.latest.captured_at) : null
        return d?.overdue ?? !t.latest
      }).length,
    [trees],
  )

  /**
   * The one tree the hero shows: whatever is furthest past its due date, and a
   * never-checked tree ahead of everything since it has no evidence at all.
   *
   * Deliberately NOT "the first due tree in the list". The list is ordered by
   * registration date, so on a forty-tree round the arbitrary first row would
   * take the biggest slot on the screen while a tree six days overdue sat
   * three screens down.
   */
  const focus = useMemo(() => {
    if (!trees) return null
    const work = trees
      .map((tree) => ({
        tree,
        due: tree.latest ? nextCheckinDue(tree.latest.captured_at) : null,
      }))
      .filter((x) => (x.due ? x.due.overdue : true))
    if (work.length === 0) return null
    // Unchecked trees have no due date; rank them above every overdue one.
    return work.sort(
      (a, b) => (b.due?.days ?? Infinity) - (a.due?.days ?? Infinity),
    )[0]
  }, [trees])

  const today = new Date()
  /*
   * The hero used to be the weekday — the biggest text on the home screen said
   * "Friday", which reads as a template. It now greets the person, matching
   * SponsorHome; the full date stays as the eyebrow because "did I already do
   * these today?" is still the most common check-in-round question.
   */
  const hour = today.getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]

  return (
    <div className="px-margin-mobile pt-1 pb-2">
      {/* Dated greeting */}
      <p className="text-label-lg text-on-surface-variant">
        {today.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </p>
      <h1 className="mt-0.5 font-headline text-headline-xl font-bold text-on-surface">
        {firstName ? `${greeting}, ${firstName}` : greeting}
      </h1>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/*
        ONE hero. Previously this was three stat cards of equal weight plus a
        survival bar — four competing figures and no subject, which is the main
        reason the screen read as a template. Survival is what this product
        proves, so it is the only thing at display size; everything else is
        demoted into the strip below.
      */}
      {/*
        THE HERO IS AN INSTRUCTION, NOT A SCORE.

        It used to open with "TREES CONFIRMED ALIVE / 4 of 8 / 50% survival".
        Four of those eight were UNCHECKED, not dead - so the first number a
        planter saw each morning counted their unfinished work as failure, and
        the one figure that would actually change their next hour ("3 due now")
        was the smallest, greyest cell on the screen.

        A grove list is a work list. It answers "what do I do today?" first and
        "how am I doing?" second. Survival and earnings are still here, because
        they are what the product proves - they are just no longer the greeting.
      */}
      {/*
        THE HERO IS THE TREE, NOT THE COUNT.

        "Trees due now: 3" is a fact about a list. A planter cannot walk to a
        3. Leading with the specific tree that is most overdue - its own last
        photograph, its name, and the one button that starts the visit - turns
        the home screen from a summary into the first step of the round.

        It also puts the app's own evidence at the top of its own home screen,
        which a product that claims identity IS photo history should have been
        doing from the start.

        When there is no work, the count comes back. A grove with nothing due
        should be reporting proof, not manufacturing urgency, and that is the
        one moment the survival figure deserves display size.
      */}
      {focus ? (
        <PhotoHero
          photo={focus.tree.latest ? thumbs.get(focus.tree.latest.wide_photo) : null}
          alt={`Most recent photo of ${demoCommonName.get(focus.tree.id) ?? treeLabel(focus.tree)}`}
          chip={
            <span
              className={`chip ${focus.due?.overdue ? 'chip-flagged' : 'chip-review'}`}
            >
              {focus.due?.label ?? 'Never checked'}
            </span>
          }
          eyebrow={dueCount > 1 ? `Next of ${dueCount} due` : 'Due now'}
          title={demoCommonName.get(focus.tree.id) ?? treeLabel(focus.tree)}
          sub={
            focus.tree.species ||
            (focus.tree.latest ? 'Species not recorded' : 'Not yet checked in')
          }
          action={
            <Link
              to={`/checkin?tree=${focus.tree.id}`}
              className="btn btn-fab bg-white text-primary"
            >
              <Icon name="camera" size={18} />
              Check in
            </Link>
          }
        />
      ) : (
        <HeroCard
          label="Trees confirmed alive"
          value={trees ? `${alive} of ${trees.length}` : '-'}
          badge={
            trees && trees.length > 0 ? (
              <HeroBadge tone="good">{survival}% survival</HeroBadge>
            ) : undefined
          }
        >
          <p className="mt-1 text-body-md text-on-primary/75">
            {trees && trees.length > 0
              ? `Every tree is up to date. Nothing to walk to${
                  balance === null ? '' : ` · GH₵${balance.toFixed(0)} earned`
                }.`
              : 'Register a tree to begin.'}
          </p>
          <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              // scaleX, not width. Animating width runs layout on every frame;
              // transform is composited. This bar sits in the hero card that
              // paints first on a low-end Android, which is exactly where a
              // layout-thrashing animation is felt.
              className="h-full w-full origin-left rounded-full bg-inverse-primary transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${survival / 100})` }}
            />
          </div>
        </HeroCard>
      )}

      {/*
        The three-equal-stat strip is gone. Three identical cards in a row is
        the most recognisable generated-dashboard shape there is, and it gave
        Earned, Due and Flagged the same visual weight when only one of them is
        ever an instruction. Flagged now earns attention only when it is not
        zero, as a single line rather than a permanent third of the screen.
      */}
      {trees && counts.flagged > 0 && (
        <Link
          to="/grove"
          onClick={(e) => {
            e.preventDefault()
            setFilter('flagged')
          }}
          className="card mt-2.5 flex items-center gap-2.5 py-3 active:bg-surface-container-low"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
            <Icon name="warning" size={15} />
          </span>
          <span className="flex-1 text-label-lg font-semibold text-on-surface">
            {counts.flagged} {counts.flagged === 1 ? 'tree needs' : 'trees need'} your
            attention
          </span>
          <Icon name="chevron-right" size={16} className="text-on-surface-variant" />
        </Link>
      )}

      <h2 className="section-h">Your trees</h2>

      {/* Filter pills — the counts are the point. A planter with one flagged
          tree needs to find it without scrolling forty cards. */}
      <div className="hscroll hscroll-fade -mx-margin-mobile mb-3 flex gap-2 px-margin-mobile pb-1">
        <FilterPill f="all" cur={filter} set={setFilter} n={counts.all}>All</FilterPill>
        <FilterPill f="verified" cur={filter} set={setFilter} n={counts.verified}>Verified</FilterPill>
        <FilterPill f="review" cur={filter} set={setFilter} n={counts.review}>Review</FilterPill>
        <FilterPill f="flagged" cur={filter} set={setFilter} n={counts.flagged}>Flagged</FilterPill>
      </div>

      {!trees && !error && (
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card overflow-hidden p-0">
              <div className="skeleton aspect-[5/4]" />
              <div className="space-y-2 px-3 pt-2.5 pb-3">
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-4 w-4/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {trees?.length === 0 && (
        <EmptyState
          title="No trees yet"
          body={`Register your first tree${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}, and start proving it lives.`}
          action={
            <Link to="/register" className="btn btn-primary btn-fab">
              <Icon name="plus" size={20} />
              Register a tree
            </Link>
          }
        />
      )}

      {trees && trees.length > 0 && shown.length === 0 && (
        <p className="py-stack-lg text-center text-on-surface-variant">
          No trees in this filter.
        </p>
      )}

      {grouped && grouped.due.length > 0 && grouped.done.length > 0 && (
        <p className="group-h">Due now</p>
      )}

      <div className="rise-stagger grid grid-cols-2 gap-2.5">
        {(grouped ? grouped.due : shown).map((tree) => (
          <TreeRow
            key={tree.id}
            tree={tree}
            thumb={tree.latest ? thumbs.get(tree.latest.wide_photo) : undefined}
          />
        ))}
      </div>

      {/* The rest of the grove. Present, because a planter wants to see their
          whole grove - but visually settled, because there is nothing to do
          here. The heading only appears when there is work above it to
          separate from. */}
      {grouped && grouped.done.length > 0 && (
        <>
          {grouped.due.length > 0 && <p className="group-h">Up to date</p>}
          <div className="rise-stagger grid grid-cols-2 gap-2.5">
            {grouped.done.map((tree) => (
              <TreeRow
                key={tree.id}
                tree={tree}
                thumb={tree.latest ? thumbs.get(tree.latest.wide_photo) : undefined}
              />
            ))}
          </div>
        </>
      )}

      <div className="pb-[168px]" />

      {trees && trees.length > 0 && (
        <Link
          to="/register"
          className="btn btn-primary btn-fab fixed right-margin-mobile bottom-[104px] z-40"
        >
          <Icon name="plus" size={20} />
          Register Tree
        </Link>
      )}
    </div>
  )
}


/**
 * One row of the grove.
 *
 * Extracted so the "due" and "up to date" groups cannot drift apart. Two
 * copies of an eighty-line card is how a list ends up with one group showing a
 * check-in shortcut and the other not.
 */
function TreeRow({ tree, thumb }: { tree: TreeWithLatest; thumb?: string }) {
  const due = tree.latest ? nextCheckinDue(tree.latest.captured_at) : null
  const name = demoCommonName.get(tree.id) ?? treeLabel(tree)

  return (
    /*
      TWO COLUMNS OF PHOTOGRAPHS, NOT A LIST OF ROWS.

      The row layout gave each tree a 112px thumbnail beside three lines of
      text. Squared off that is roughly 12,500px of evidence per tree; a card
      in this grid gives about 29,000. Same screen, more than twice the
      photograph - on the screen belonging to a product whose entire claim is
      that a tree's identity IS its photographic record.

      It costs about one tree per screenful of scroll. That is the trade and it
      is worth taking: a planter opening their grove is looking for a tree they
      recognise, and recognition is a function of image size, not row count.

      The row also had a hard geometry problem - three columns fighting over
      180px of text width, which truncated names and due labels until it was
      measured and re-cut twice. A card gives every line the full width of its
      own column and the problem stops existing.
    */
    <div className="relative">
      <Link
        to={`/tree/${tree.id}`}
        className="card block overflow-hidden p-0 active:bg-surface-container-low"
      >
        <div className="relative aspect-[5/4] bg-surface-container-high">
          {thumb ? (
            <img
              src={thumb}
              alt={`Most recent photo of ${name}`}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-on-surface-variant">
              <Icon name="image" size={26} />
            </div>
          )}
          {/* On the photograph, as every listing app does it - the state needs
              no learning there, and it costs the text column nothing. */}
          <span className="absolute left-2 top-2">
            <StatusChip status={tree.latest?.verdict ?? 'pending'} />
          </span>
        </div>

        <div className="px-3 pt-2.5 pb-3">
          {/*
            The instruction is still ABOVE the name and still carries the
            colour. A planter standing in their own grove already knows what
            the tree is called; what they do not know is whether it is due.
          */}
          <span
            className={`block truncate text-label-md font-semibold ${
              due?.overdue ? 'text-error' : 'text-on-surface-variant'
            }`}
          >
            {due ? due.label : `Added ${formatAge(tree.created_at)}`}
          </span>
          <h3 className="mt-0.5 truncate font-headline text-headline-md font-semibold text-on-surface">
            {name}
          </h3>
        </div>
      </Link>

      {/*
        The check-in shortcut, pinned to the bottom-right of the PHOTOGRAPH.

        This overlay mirrors the photo's own aspect ratio rather than offsetting
        the button by a hardcoded distance from the card's bottom. The card is
        172px wide on a 390px screen today and something else on a 320px one,
        so any pixel offset would drift off the seam at other widths. Matching
        the ratio pins it correctly at every size.

        It first sat over the text with `pr-9` reserving room for it, which
        truncated four of eight tree names by up to 19px - the third time this
        screen has lost text to a control parked in a text column. Keeping the
        button entirely inside the image ends that class of bug: the name gets
        the full width of its own card.

        A SIBLING of the card link, never a child. An anchor inside an anchor
        is invalid HTML and unpredictable on mobile Safari, and this was that
        exact bug once - a control that looked like a check-in shortcut and
        silently opened the tree page instead.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[5/4]">
        <Link
          to={`/checkin?tree=${tree.id}`}
          aria-label={`Check in on ${name}`}
          className="pointer-events-auto absolute right-2 bottom-2 flex size-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_4px_14px_-4px_rgb(var(--tint-ink)/0.55)] transition-transform ease-out active:scale-95"
          style={{ transitionDuration: 'var(--duration-press)' }}
        >
          <Icon name="camera" size={18} />
        </Link>
      </div>
    </div>
  )
}

function FilterPill({
  f,
  cur,
  set,
  n,
  children,
}: {
  f: Filter
  cur: Filter
  set: (f: Filter) => void
  n: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => set(f)}
      className={`pill ${cur === f ? 'pill-on' : 'pill-off'}`}
    >
      {children} ({n})
    </button>
  )
}
