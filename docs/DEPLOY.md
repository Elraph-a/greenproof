# Deploy and field-test

Order matters. Each step's output is the next step's input.

---

## 1 · Local check  *(5 min, at your desk)*

```
cd app
cp .env.example .env              # then paste your Supabase URL + anon key
npm install
npm run check                     # typecheck + tests + production build
npm run dev
```

Open <http://localhost:5173>. You should get the landing page.

**What works on desktop:** sign in, My Grove, the register flow's shape.
**What does NOT work on desktop:** GPS accuracy is fake (IP-based, ±5000 m),
there is no compass, and "take a photo" opens a file picker instead of a camera.

That is expected. Desktop proves the plumbing; only the phone proves the app.

---

## 2 · Deploy to Vercel  *(10 min)*

The phone needs real HTTPS - camera, GPS and compass are all silently disabled
over plain HTTP.

```
cd app
npx vercel            # first run: log in, link the project
npx vercel --prod
```

When it asks:

| Prompt | Answer |
|---|---|
| Set up and deploy | **yes** |
| Which scope | your account |
| Link to existing project | **no** |
| Project name | `greenproof` |
| In which directory is your code | `./` *(you are already inside `app/`)* |
| Modify build settings | **no** - `vercel.json` handles it |

Then add the environment variables - **the build will succeed without them and
the app will fail at runtime**, which is a confusing five minutes if you skip
this:

Vercel dashboard → your project → **Settings → Environment Variables**

| Name | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | your project URL | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | your anon key | Production, Preview, Development |

**Redeploy after adding them** (`npx vercel --prod`). Vite bakes env vars in at
build time, so variables added after a build are not in that build.

### Then, in Supabase

**Authentication → URL Configuration**

- **Site URL:** your Vercel production URL
- **Redirect URLs:** add both your Vercel URL and `http://localhost:5173`

Skip this and the magic-link email will bounce you to `localhost` on your phone,
which cannot work.

---

## 3 · Install it on your phone

Open the Vercel URL in **Chrome on Android**, then menu → **Add to home screen**.

Do this rather than using the browser tab. Installed PWAs get:
- no address bar stealing 60px of a screen you are using one-handed in sun
- persistent storage that the browser will not evict under pressure - which is
  what protects the pending-upload queue

---

## 4 · Field test - 3 trees, ~20 minutes, BEFORE Monday

**Do not skip this.** Monday is 40 trees; discovering a permissions problem on
tree 1 of 40 with a printed marker in your pocket is the expensive way to find it.

Walk outside and register three real trees. Check each of these:

- [ ] **Location permission** prompt appears, and you tap Allow
- [ ] GPS accuracy settles to **±10 m or better** within ~30 seconds outdoors
- [ ] Accuracy is **different for each tree** - if all three show identical
      coordinates, the reset-per-tree logic is broken and every tree would land
      on the same pin
- [ ] Camera opens the **real camera app**, not a file picker
- [ ] Photos come back **the right way up**, not rotated 90°
- [ ] The **sharpness number** is shown, and deliberately shaking the phone
      during a shot triggers the blur warning
- [ ] **"Facing: NE, 47°"** shows a real compass reading on step 4 - and it
      *changes* when you turn around. If it says "no compass", note it; the app
      still works, we lose the "face this way" hint at check-in
- [ ] Tree appears in **My Grove** with its thumbnail within ~15 seconds
- [ ] **Turn on aeroplane mode**, register a tree, and confirm the amber
      "1 tree waiting to upload" banner appears. Turn signal back on and confirm
      it clears by itself
- [ ] Tap a tree → the **photo timeline** shows your wide photo

If the compass reads nothing on your phone, tell me - there is a fallback
(deriving heading from consecutive GPS points while walking) but it is only
worth building if we need it.

---

## 5 · T0 - Monday 3 August

**Field kit**

- [ ] Phone charged + power bank
- [ ] ArUco marker printed ~80 mm, **laminated**, real width measured with a
      ruler and written on the back
- [ ] Tape measure
- [ ] Notebook

**Site requirements** - from the roadmap, and both matter:

- [ ] **≥15 of one species close together.** This is the hard case for image
      matching. Without it we cannot honestly report the number that the spike
      says is our weakest, and a judge who asks "what about a plantation?" gets
      a hand-wave instead of data
- [ ] **5–8 visibly struggling trees.** These are the only way canopy decline
      shows up across four rounds. A pilot of forty healthy trees demonstrates
      nothing about detecting death

**On the day**

1. Register ~40 trees. Say the tree number aloud into the tag field so the
   notebook and the app agree
2. **Tape-measure ~20 trunks at 1.3 m** and write each against its tree number.
   This is the validation that makes the measurement claim defensible - it is
   about an hour and no other team will have it
3. Before leaving the site, open My Grove and confirm **the count matches your
   notebook** and the pending banner is gone

Step 3 is the one people skip. Do it while you can still walk back to a tree.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Blank screen, console says "Missing VITE_SUPABASE_URL" | env vars not set in Vercel, or set after the last build - redeploy |
| Magic link opens `localhost` on the phone | Supabase Site URL still points at localhost |
| "Take photo" opens a file picker on Android | you are on `http://`, not `https://` |
| GPS stuck at ±2000 m | indoors, or Location set to "battery saving" - switch the phone to High accuracy |
| Tree registers but never appears in My Grove | check the pending banner; if it shows an error, that error is the RLS or grants problem |
| Photos sideways | report it - EXIF path needs the fallback branch |
