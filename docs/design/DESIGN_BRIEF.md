Design a mobile app called **GreenProof**.

## What it does

People in Ghana plant trees and get paid only for the trees that are still
alive months later — not for planting them. To prove a tree survived, the
planter walks to it and photographs it. The app checks the photo is genuinely
that tree, in that place, still alive, and not a re-used or faked picture. If
the checks pass, money accrues to the planter's wallet and is withdrawn to
Mobile Money.

The core promise, in the planter's words: **plant a tree, prove it lives, get
paid.**

It is not a social network, not a marketplace, and there is **no blockchain,
crypto, NFT or Web3 anything** in it. Do not use that language or imagery
anywhere — it is factually wrong about this product.

## Who uses it, and where

**The planter** — the main user. A Ghanaian student, farmer, teacher or
community volunteer. Mid-range Android phone. Uses the app **standing outside
in bright midday sun**, often one-handed, sometimes with dusty hands, on slow
or intermittent mobile data. May have 40 trees to register in a single session.

**The sponsor** — an organisation funding the planting. Uses a wide desktop
screen, indoors, wants proof their money produced living trees.

**The reviewer** — staff who look at the small number of photos the system is
unsure about.

People, names and faces in the design should be **Ghanaian**. Currency is the
Ghana cedi, written **GH₵** or **₵**.

## The feeling to aim for

Trustworthy, precise, and quietly proud. This is a system that measures things
and can show its working — closer to a good instrument or a field notebook than
to a lifestyle app. Warm rather than corporate, because the user is a person
standing in a field, not an analyst.

**Avoid:** default Material Design; an all-green-and-grey palette; generic
stock-photo optimism; anything that looks like a bank app template.

## Screens to design

Mobile, 390 × 844, unless marked desktop.

1. **Landing** — first screen, signed out. The promise, one image, one button.
2. **Sign in** — email address only, no password. The app emails a link. Include
   the "check your email" state.
3. **Profile setup** — name, phone, and which school / church / community group
   the person belongs to.
4. **My Grove** — the home screen. How many trees the person has, how many are
   confirmed alive, money earned, and the list of their trees with a photo,
   name, status and when the next check is due.
5. **Register a tree** — a 5-step flow:
   - **1 GPS** — waiting for the location to become accurate enough, showing the
     current accuracy in metres, with clear good / marginal / too-poor states
   - **2 Wide photo** — the whole tree and its surroundings
   - **3 Close-up photo** — the trunk, with a small printed reference card held
     against it for scale
   - **4 Details** — species, an optional tag number, and a summary of what was
     captured automatically (position, accuracy, compass direction, sharpness)
   - **5 Done** — with a prominent "register another" action, because the user
     has 39 more to do
6. **Check-in** — revisiting a tree. Needs: a "stand here, face this way"
   compass hint; a camera view with the **previous photo faintly overlaid** so
   the user can line up the same framing; and a step where the user taps the two
   edges of the trunk on screen to measure its width.
7. **Result / verdict** — the outcome of a check-in. A confidence score, a clear
   verdict (**verified**, **needs review**, or **flagged**), and a breakdown of
   the individual checks that passed or failed, revealed progressively rather
   than dumped as a table.
8. **Tree detail** — one tree: its photo history over time as a timeline, its
   status, its location, what it has earned.
9. **Map** — all trees as pins, coloured by status.
10. **Wallet** — balance, list of earnings, withdraw to Mobile Money.
11. **Leaderboard** — schools, churches and communities ranked by the
    **percentage of their trees still alive**, not by how many they planted.
12. **Profile** — the person's details, their stats, sign out.
13. **Review queue** *(staff)* — photos awaiting a human decision, side by side
    with the previous photo, approve / reject.
14. **Sponsor dashboard** *(desktop)* — trees funded, percentage alive, cost per
    surviving tree, a survival-over-time chart, and a wall of recently verified
    photos.

Please also include the **empty state** and the **loading state** for My Grove
and the Sponsor dashboard, and an **offline / waiting-to-upload** banner.

## Hard constraints

These will break the app if ignored.

- **The Register and Check-in screens are used in direct sunlight.** They need
  high contrast: dark text on a light background, no pale grey secondary text,
  no dark-on-dark. Every other screen is free to be dark if it suits the design.
- **Minimum tap target 56 × 56 px.** One hand, moving, dusty screen.
- **Photos are 3:4 portrait.** Do not design around square or landscape images.
- **Status vocabulary is fixed** — use exactly these words: *Verified*, *Needs
  review*, *Flagged*, *Not checked*.
- **A tag number is never a tree's identity.** It is a convenience for finding
  the tree again. Never present it as the thing that proves which tree this is.
- Design for **one thumb at the bottom of the screen** — primary actions belong
  in the lower third, not in a top-right corner.

## What I need back

- Each screen as a separate frame, mobile size, plus the desktop dashboard
- A short design-system page: colour values with their roles, type scale with
  font names and sizes, spacing scale, corner radii, and the button, input,
  card and status-chip styles
- Light and dark versions of the palette if the design uses both

Please make it look like a considered product with a point of view — not a
template. The single thing I most want to avoid is a design that could belong to
any app.
