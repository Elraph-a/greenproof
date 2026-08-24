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
      <HeroCard
        label={dueCount === 1 ? 'Tree due now' : 'Trees due now'}
        value={trees ? dueCount : '—'}
        badge={
          trees && trees.length > 0 ? (
            <HeroBadge tone="good">{survival}% survival</HeroBadge>
          ) : undefined
        }
      >
        <p className="mt-1 text-body-md text-on-primary/75">
          {trees && trees.length > 0
            ? dueCount === 0
              ? 'Every tree is up to date. Nothing to walk to.'
              : `${alive} of ${trees.length} confirmed alive${
                  balance === null ? '' : ` · GH₵${balance.toFixed(0)} earned`
                }`
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
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex min-h-[120px] gap-3 overflow-hidden p-0">
              <div className="skeleton w-28 shrink-0 self-stretch" />
              <div className="flex-1 space-y-2.5 py-4 pr-4">
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
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

      <div className="rise-stagger flex flex-col gap-2.5">
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
          <div className="rise-stagger flex flex-col gap-2.5">
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
      THREE COLUMNS, NOT TWO PLUS AN OVERLAY.

      The check-in shortcut used to be absolutely positioned in the top-right
      corner, so the topmost text row had to reserve 48px of empty padding for
      it. After the row was reordered to lead with the tree's state, that row
      never fit: measured at 9px of overflow, ellipsising "Due tomorrow" and
      "Added 2 weeks" on every card.

      Giving the button its own column removes the overlap instead of
      negotiating around it, and every text row gets its full width back. Still
      a SIBLING of the card link and never a child: an anchor inside an anchor
      is invalid HTML and unpredictable on mobile Safari.
    */
    <div className="card flex min-h-[96px] items-stretch overflow-hidden p-0">
            <Link
              to={`/tree/${tree.id}`}
              className="flex min-w-0 flex-1 items-stretch active:bg-surface-container-low"
            >
              {/*
                The photo IS the product — this app exists to photograph trees,
                so the evidence runs flush to the card edge at full height
                rather than sitting as a thumbnail inside the padding.
              */}
              {/*
                THE STATUS BADGE SITS ON THE PHOTO.

                In the text column the chip cost 91px of a 180px row, so
                whichever line it shared got truncated: first the schedule, then
                the tree's name down to "Aben...". Moving it onto the evidence
                frees the whole column, and a state badge on a thumbnail is the
                pattern every listing app already uses, so it needs no learning.
              */}
              <div className="relative w-28 shrink-0 bg-surface-container-high">
                {thumb ? (
                  <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-on-surface-variant">
                    <Icon name="image" size={24} />
                  </div>
                )}
                <span className="absolute inset-x-1.5 bottom-1.5 flex justify-center">
                  <StatusChip status={tree.latest?.verdict ?? 'pending'} />
                </span>
              </div>

              {/*
                THREE elements, down from seven. Species (a Latin binomial in
                italics on every row), the tag code and the per-tree money chip
                all moved to the tree page. On a list of forty they were noise,
                and eight amber chips in a column destroyed the rule that amber
                means money — it just meant "a card".
              */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-3.5 pr-2 pl-3.5">
                {/* The name carries the clearance for the check-in button in
                    the top corner. It has the most slack of the three — a long
                    name ellipsises harmlessly next to its own photograph,
                    whereas a clipped status or date loses actual information. */}
                {/*
                  HIERARCHY WAS INVERTED. The tree's NAME - the one thing the
                  planter already knows, because they are standing in their own
                  grove - was the biggest, blackest text on the row, while the
                  only field that tells them what to do today was the smallest
                  and the palest.

                  So the row now leads with the state and demotes the name to
                  an identifier. Weight and colour carry it rather than size:
                  making the due label bigger would have cost the photograph
                  its width, and the photograph is the evidence.
                */}
                {/*
                  THE INSTRUCTION GETS ITS OWN LINE.

                  Chip and schedule shared a row and did not fit: measured, the
                  text column carries 180px, the status chip takes 91, and "1
                  day overdue" needs 98. Shaving padding was never going to
                  close a 17px gap.

                  Giving the schedule the full width fixes the overflow and
                  sharpens the hierarchy at the same time - the line that says
                  what to do today is now unshared and unabbreviated. The chip
                  drops to the second row beside the name, where the name may
                  ellipsise harmlessly next to its own photograph.
                */}
                <span
                  className={`truncate text-label-lg font-semibold ${
                    due?.overdue ? 'text-error' : 'text-on-surface-variant'
                  }`}
                >
                  {due ? due.label : `Added ${formatAge(tree.created_at)}`}
                </span>
                <h3 className="truncate font-headline text-headline-lg font-semibold text-on-surface">
                  {name}
                </h3>
              </div>
            </Link>

            {/*
              A SIBLING of the card link, not a child of it.

              This was an aria-hidden <span> INSIDE the <Link>, so it looked
              like a check-in shortcut and actually navigated to the tree page
              like the rest of the card — a control that lied about what it did.
              As a sibling it goes where it claims, and an anchor nested inside
              an anchor (invalid HTML, unpredictable on mobile Safari) is
              avoided. Absolutely positioned, so it costs the text rows nothing.
            */}
            <Link
              to={`/checkin?tree=${tree.id}`}
              aria-label={`Check in on ${name}`}
              className="flex w-14 shrink-0 items-center justify-center self-stretch text-primary active:bg-primary-container/60"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary-container">
                <Icon name="camera" size={17} />
              </span>
            </Link>
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
