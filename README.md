# Allowance — a family chore & pocket-money PWA

An installable web app where a child taps a button for each chore they finish and
watches their balance grow. Runs on iPhone, Android, Mac and Windows, installs to
the home screen / dock, works offline, and syncs live between everyone's devices.

* **Daily tasks — €1 each:** dishwasher, evening kitchen, cat toilet, cat litter
  sand, trash, store. One press per task per day; the button greys out until
  midnight.
* **Weekly tasks — €4 each:** apartment vacuuming, cleaning bathroom. One press
  per task per week; resets Monday.
* Perfect week = **€50** (€6 × 7 days + €8).
* At **€15** the balance, the ring and the progress bar all turn **green**, with a
  little confetti the moment the goal is crossed.
* English / Slovenian, light / dark, Apple-style liquid glass in blue.

---

## 1. Put it on GitHub Pages

```bash
cd allowance-pwa
git init && git add -A && git commit -m "Allowance PWA"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save.**

A minute later the app is live at `https://<you>.github.io/<repo>/`.

> The `.nojekyll` file in this folder is required — without it GitHub Pages'
> Jekyll step can drop files. Don't delete it.

> Nothing you tap while testing is stored in these files — completions live in the
> browser, or in Firestore once step 2 is done — so there is no test data to strip
> out before you push. To clear what is already in a browser, see **Starting
> clean** below.

At this point the app already works, but each device keeps its own data. Step 2
gives everyone one shared database.

## 2. Turn on syncing (Firebase — free, ~5 minutes)

1. Go to <https://console.firebase.google.com> → **Add project**. Name it
   anything; you can switch Google Analytics off.
2. **Firestore** (`Databases and storage → Firestore Database`) → **Create
   database** → *production mode* → region `eur3` for Europe.
   **Leave the Database ID box alone** so it creates `(default)`, parentheses
   included — that is the one the SDK looks for. If you do name it something
   else, put that name in `firestoreDatabaseId` in `config.js`; this project is
   set to `"default"` because that is how its database was created.
3. **Authentication** (`Security → Authentication`) → Get started → Sign-in
   method → **Anonymous → Enable**. The app signs in silently; nobody ever sees a
   login screen. Menu names differ between console versions — Firestore may sit
   under *Databases and storage* and Authentication under *Security*.
4. **Firestore Database → Rules** → replace everything with the contents of
   [`firestore.rules`](firestore.rules) → **Publish**.
5. **Project settings (⚙) → Your apps → Web (`</>`) → register the app.** Copy the
   six values out of the `firebaseConfig` object it shows you.
6. Open [`config.js`](config.js) and paste them in:

   ```js
   childName: "Luka",                // optional

   firebase: {
     apiKey:            "AIza…",
     authDomain:        "your-project.firebaseapp.com",
     projectId:         "your-project",
     storageBucket:     "your-project.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId:             "1:1234567890:web:abcdef"
   }
   ```

7. **Authentication → Settings → Authorized domains → Add domain** →
   `<you>.github.io`.
8. Commit and push. The chip in the top bar turns green and says **Synced**.

Those Firebase keys are meant to be public — they identify the project, they
don't grant access. The rules in step 4, plus your family code, are what protect
the data.

Note there is no household id or PIN to fill in here. See **Secrets** below.

## 3. Install it

* **iPhone / iPad** — open the URL in Safari → Share → *Add to Home Screen*.
* **Android** — Chrome → menu → *Install app*.
* **Mac** — Safari → File → *Add to Dock*, or Chrome → address-bar install icon.
* **Windows** — Edge/Chrome → address-bar install icon.

## 4. Day-to-day

* The child taps a task tile. It turns green, greys out, and the money lands on
  the balance instantly on every device.
* **Parent mode** — Settings → enter the PIN you chose on this device's first-run
  screen. It unlocks:
  * **Pay out** on the Dashboard. Subtracts from the balance and is recorded in
    History; all-time earnings keep counting up.
  * **Reset a mis-tap.** A finished tile stays tappable — tap it and confirm, and
    it goes back to "Tap to earn" with the money taken off the balance. The same
    thing is available as **Undo** on every row in History.
  * **Add a task.** Settings → Tasks → *Add a task*: name, icon, reward and daily
    or weekly. It appears alongside the built-in chores on every device.
  * **Remove a task**, and put it back with **Restore**.
  * **Erase all data** — see below.
* **Removing a task** takes it off the tasks screen, the weekly grid and the
  per-task chart, and lowers the daily/weekly maximum. It does *not* touch money
  already earned from it — the balance and the History entries stay exactly as
  they were, which is why the same list offers **Restore** to put it back. The
  removed list is stored in the shared database, so it applies on every device.
* **Erase all data** (Settings, at the bottom, Parent mode only) wipes every
  completion, every payout, the running totals and any tasks you added — on every
  device. Two confirmations, and there is no undo. Use it once to clear your
  testing before the family starts using the app for real.
* Offline presses are queued and sync as soon as the phone is back online.

---

## Secrets

This repository is public, so anything committed to it is world-readable. Two
values therefore never appear in the source:

| | Where it lives | What it protects |
|---|---|---|
| **Family code** | typed on each device at first run, kept in that browser | which Firestore folder your data is in — whoever knows it can read and write your family's data |
| **Parent PIN** | same | pay out, reset a task, edit the task list, erase all data |

The first time the app opens on a device it asks for both (just the PIN until
Firebase is connected) and stores them in that browser. Type the same family code
on every family device — that is what links them to the same data. Parent mode →
Settings → *Change PIN or family code* to redo it.

Two honest caveats. The PIN is a client-side check: it keeps a curious child out
of the parent controls, but anyone willing to clear the site's storage gets past
it, so don't treat it as a lock on real money. And the Firebase config values in
`config.js` are public by design — Google intends them to be; access is decided
by the Firestore rules and by whether someone knows your family code.

## Starting clean

Two ways to throw testing data away.

**Remotely, before Firebase is connected.** Change `resetToken` in `config.js` to
any new string and push:

```js
resetToken: "2026-09-14-clean",
```

Every device clears its stored completions, payouts and added tasks the next time
it loads the page — your Mac, your phone, your child's phone — with nothing to
tap. It happens once per token; anything earned afterwards is kept normally.
Language, theme and the parent unlock survive.

**In the app, once Firebase is connected.** Parent mode → Settings → **Erase all
data**. The shared database is the source of truth by then, so one device wiping
it clears it for everyone. `resetToken` only ever touches local storage, so it is
the wrong tool at that point.

## Changing the tasks or the amounts

Everything lives in the `TASKS` array at the top of [`app.js`](app.js):

```js
{ id:"trash", emoji:"🗑️", cadence:"daily", amount:1,
  en:"Trash",  en_sub:"Take it out",
  sl:"Smeti",  sl_sub:"Odnesi ven" },
```

`cadence` is `"daily"` or `"weekly"`; `amount` is euros. Keep `id` stable — it is
what past completions are stored under.

You mostly don't need to touch this list: adding and removing chores is done from
Settings → Tasks in Parent mode. Editing `app.js` is for changing the built-in
eight — their wording, emoji or price. Tasks added in the app carry one name used
in both languages, since there is nowhere sensible to ask for a translation. Change the €15 goal, the currency and the
PIN in [`config.js`](config.js).

After editing anything, bump `CACHE` in [`sw.js`](sw.js) (`allowance-v1` →
`allowance-v2`) so installed copies pick the update up instead of serving the old
cached files.

## Files

| File | What it is |
|---|---|
| `index.html` | markup and the three views |
| `styles.css` | the whole design system (blue palette, glass, light/dark) |
| `app.js` | tasks, i18n, storage layer, dashboard rendering |
| `config.js` | **the only file you need to edit** — Firebase keys, goal, `resetToken` |
| `sw.js` | service worker — offline support |
| `manifest.webmanifest` | makes it installable |
| `firestore.rules` | paste into the Firebase console |
| `icons/make_icons.py` | regenerates the app icons (`python3 icons/make_icons.py`) |

## Running it locally

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. (Opening `index.html` straight off disk won't
work — ES modules and service workers need `http://`.)

## How the data is stored

```
households/<householdId>/
  completions/<taskId>__d:2026-08-30     one doc per task per period
  completions/<taskId>__w:2026-W35
  payouts/<autoId>
  state/main                             { earnedTotal, paidTotal, doneCount }
  state/tasks                            { removed: [taskId, …], custom: [task, …] }
```

Because the document id contains the period, a second press the same day can't
create a second document — the guarantee holds even if two devices tap at the
same moment. `state/main` is updated in the same transaction, so the balance can
never drift from the history.
