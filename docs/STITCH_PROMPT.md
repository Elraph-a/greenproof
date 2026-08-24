# Stitch design prompts — GreenProof

**Work in ONE Stitch project.** Stitch carries style context between prompts
inside a project; starting fresh each time gives you eight screens that don't
match, and re-unifying them by hand costs more than the design saved.

Paste **§0 first**, then one numbered section at a time.

---

## Batch order — matters, because of T0 on Monday 3 Aug

| Batch | Sections | When | Why |
|---|---|---|---|
| **A** | §0 · 1 · 2 · 3 | **now** | These are the only screens T0 needs. Registration is the whole Monday job. |
| **B** | §4 · 5 | tonight / tomorrow AM | Check-in runs from ~8 Aug, not Monday |
| **C** | §6 · 7 · 8 · 9 | any time before 20 Aug | Map, wallet, leaderboard, sponsor, reviewer |

If you only get through Batch A, Monday still happens. Nothing in B or C is on
the critical path.

---

## What to bring back

**Drop everything into [`docs/design/`](design/). Unsorted.** Screenshots,
exports, ZIPs, a photo of your screen — whatever Stitch gives you. Don't rename
or organise it; working out which screen is which and which batch it belongs to
is my job, not yours.

The one thing worth thirty seconds of effort: fill in
[`docs/design/PALETTE.md`](design/PALETTE.md) with the hex codes. That single
file restyles all twelve screens at once, because every screen already reads its
colours from one token block in `app/src/index.css`. Screenshots are useful; the
hex codes are what actually move the build.

Screenshots alone are enough to work from. Don't block on getting exports.

---

## §0 · Context — paste this first, before any screen

> I'm designing **GreenProof**, a mobile web app used in Ghana. People
> photograph trees they've planted so software can verify the tree is still
> alive. Verified trees earn the owner money through Mobile Money.
>
> **Users:** farmers, students, church and school groups in Ghana. Mid-range
> Android phones, often used in bright outdoor sunlight.
>
> **Design constraints — these matter more than looking pretty:**
> - Mobile-first, portrait. Designed to be used **one-handed while standing at a
>   tree**.
> - **Very high contrast.** It will be read in direct sun. Never use light grey
>   text on a white background — mid-grey on off-white is unreadable outdoors.
> - **Large tap targets**, minimum 56px tall — a thumb, possibly dusty or wet.
> - **One clear primary action per screen**, as a big full-width button near the
>   bottom where a thumb reaches.
> - Minimal typing. Almost everything is tapping or taking a photo.
> - Show progress clearly in multi-step flows.
>
> **Visual direction:** clean, warm, trustworthy. Deep forest green as the
> primary colour, warm off-white background (not pure white), a bright green
> accent for success states. Rounded cards, generous spacing, friendly but not
> childish. It should feel like **a banking app that happens to be about
> trees** — real money is involved and people need to trust it.
>
> **Navigation:** bottom tab bar with 4 tabs — My Grove, Map, Wallet, Profile —
> plus one prominent "Register a tree" action.
>
> Please give me a colour palette with hex codes and a type scale before we
> start on screens.

---

## §1 · Getting in  *(Batch A)*

> Design 3 screens:
>
> **Landing** — explains GreenProof in one line: "Plant a tree. Prove it lives.
> Get paid." A hero photo of a young tree. One button: Get started.
>
> **Sign in** — an email address field and a "Send me a link" button. A short
> note saying no password is needed. Then a confirmation state: "Check your
> email — we sent a link to r@example.com", with a "Send it again" text link.
>
> **Profile setup** — full name, phone number (labelled "for Mobile Money
> payouts"), an optional photo of yourself, and a short "your story" text box
> (one sentence about why you're planting). Explain that the photo and story are
> shown to the sponsors funding the trees.

---

## §2 · My Grove — the home screen  *(Batch A)*

> Design the home screen, called **My Grove**.
>
> At the top, a summary strip: total trees, how many are verified, and current
> wallet balance in Ghana Cedis.
>
> Below it, the user's trees as a vertical list of cards. Each card shows:
> - a thumbnail of the tree's most recent photo
> - the tree's name/number and species
> - a **status chip**: Verified (green) / Needs review (amber) / Flagged (red) /
>   Not checked yet (grey)
> - how old the tree is
> - **when the next check-in is due** — with overdue ones clearly highlighted
>
> A prominent floating **+ Register a tree** button above the bottom tab bar.
>
> Also design:
> - the **empty state** for a user with no trees — warm and encouraging, with
>   the register button as the obvious next step
> - a **loading state** with skeleton cards
> - a small **"3 trees waiting to upload"** banner that appears when the phone
>   has been offline, with a retry action

---

## §3 · Register a tree — 5-step flow  *(Batch A — the Monday screen)*

> Design a 5-step flow with a step indicator at the top ("Step 2 of 5"). Each
> step is a full screen with one clear action.
>
> **Step 1 — Location.** A map showing the user's current position with a GPS
> accuracy circle around it. Large text: "Accuracy: ±6 m" with a green tick.
> Design three states: **good** (±10 m or better), **poor** (amber — "Move into
> the open and wait a moment"), and **too poor to continue** (the button is
> disabled). Button: Use this location.
>
> **Step 2 — Wide photo.** A full-screen camera view with a faint framing
> outline. Instruction at the top: "Step back and photograph the whole tree with
> its surroundings." A large circular shutter button at the bottom. After
> capture, a review state with Retake / Use photo, and a **blur warning** card
> that appears if the photo is soft: "This looks blurry — retake?"
>
> **Step 3 — Close-up photo.** Same camera layout. Instruction: "Photograph the
> trunk from about 1 metre. Hold your marker card flat against the trunk." Show
> a small thumbnail example of a good close-up in the corner.
>
> **Step 4 — Details.** A species field, a tag number field, and a compass
> readout showing which way the phone is facing ("Facing: NE, 47°"). Make it
> clear species and tag are **optional** and the compass is captured
> automatically.
>
> **Step 5 — Done.** Success screen: a big green tick, the new tree's ID, a
> small map pin, and two buttons — **Register another** (primary, because they
> are standing in a field with 39 more to do) and **Back to My Grove**.
>
> Also design:
> - an **uploading state** with a progress bar and photo thumbnails
> - an **offline state**: "Saved on your phone. It will upload when you have
>   signal." — reassuring, not an error

---

## §4 · Check in on a tree  *(Batch B)*

> Design the check-in flow — the user returns to a tree weeks later.
>
> **Step 1 — Which tree.** A list of nearby trees sorted by distance ("Tree 7 —
> 4 m away"), each with its last photo. The user taps one to confirm.
>
> **Step 2 — Position.** A large compass dial showing which direction to face,
> with the text "Stand here and face this way". A satisfying green tick state
> when they're aligned within about 15°.
>
> **Step 3 — Wide photo with ghost overlay.** This is the key screen. A camera
> view with the **previous photo shown faintly on top**, so the user can line up
> the same shot. A slider to control how visible the ghost image is.
>
> **Step 4 — Close-up with measurement.** After capture, the photo fills the
> screen and the user **taps the left edge and then the right edge of the
> trunk**. Show two draggable markers and the resulting width appearing in
> millimetres. Include a "Start again" option.
>
> **Step 5 — Checking.** A results screen where **four checks resolve one at a
> time**, each turning from a spinner into a tick or a cross:
> - Location ✓
> - Still alive ✓
> - Not a duplicate photo ✓
> - Matches previous photos ✓
>
> A confidence score counts up as they land. Then a final verdict card:
> **Verified**, **Sent for review**, or **Flagged** — each a distinct colour
> with a plain-English explanation of what happens next.

---

## §5 · Tree detail  *(Batch B)*

> Design a single tree's page.
>
> Header: tree ID, species, age, current status chip, owner.
>
> **A photo timeline** — every visit's wide photo in a horizontal scrolling
> strip in date order, so you can see the tree change over time. This is the
> most important element on the page; give it room.
>
> Below that:
> - a **confidence over time** line chart
> - a **trunk width over time** chart
> - a "Why this score" section: the four checks each with its own score bar and
>   a one-line plain-English explanation
> - total earnings from this tree

---

## §6 · Map, Wallet, Profile  *(Batch C)*

> **Map** — a full-screen map with tree pins coloured by status (green verified,
> amber review, red flagged, grey unchecked). Tapping a pin opens a small card
> from the bottom with the tree's photo, ID and status. A filter control for
> status and species.
>
> **Wallet** — the current balance in Ghana Cedis, large and prominent. A list
> of earnings entries, each showing which tree and which milestone earned it. A
> "Withdraw to Mobile Money" button, and a payout history section below.
>
> **Profile** — the user's photo, name, story, and stats (trees planted,
> survival rate, total earned). Settings for notifications and sign out.

---

## §7 · Leaderboard  *(Batch C)*

> Design a leaderboard where schools, churches and community groups compete. A
> ranked list showing group name, number of trees, and survival percentage. Top
> three highlighted with medals. A toggle between "Most trees" and "Best
> survival rate".

---

## §8 · Sponsor dashboard  *(Batch C — different user, wider screen)*

> Design a dashboard for a company sponsoring trees. This user is an office
> worker on a laptop, not a farmer on a phone — so design for a wide screen and
> a more corporate feel, keeping the same colours.
>
> Top row of stat cards: trees funded, percentage still alive, cost per
> surviving tree, total invested.
>
> Below: a **survival curve** over time, a **map of their groves**, a
> **satellite greenness trend** chart for the whole plot, and a photo wall of
> recent verified check-ins with each planter's name and photo attached.

---

## §9 · Reviewer screen  *(Batch C — internal tool)*

> Design an internal review screen for uncertain check-ins.
>
> A queue list on the left showing pending items with their confidence scores.
> The main panel shows the **previous photo and the new photo side by side**,
> the four check results with scores, the GPS distance, and two large buttons:
> **Approve** and **Reject**.

---

## Notes

- **Every screen needs a loading state and an empty state.** Those are half the
  real work and Stitch skips them unless you ask. Ask.
- Keep the four-check language identical everywhere: **Location · Still alive ·
  Not a duplicate · Matches previous photos.** It appears in the check-in flow,
  the tree detail page and the reviewer screen, and judges will hear it three
  times in 20 minutes. Consistent naming is free clarity points.
- **Dark mode is not required.** The app is used in daylight. Skip it.
- If Stitch produces something you don't like, it's usually faster to re-prompt
  with one specific correction ("make the shutter button twice as large and move
  it 40px up") than to start over.
