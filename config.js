/* ============================================================================
 *  Allowance PWA — configuration
 *  ---------------------------------------------------------------------------
 *  This is the ONLY file you need to edit. See README.md for the 5-minute
 *  Firebase setup. Until you fill in the firebase block below, the app runs in
 *  "Local only" mode: fully functional, but data stays on that one device.
 * ==========================================================================*/

window.APP_CONFIG = {

  /* Name shown on the dashboard. */
  childName: "",              // fallback only. Set the name in the app:
                              // Parent mode -> Settings -> Child’s name.

  /* Starting goal that turns the balance green. A parent can change it in the
     app (Settings -> Goal); that shared value wins over this one. */
  goalAmount: 15,
  currency: "EUR",
  currencySymbol: "€",

  /* Default language: "en" or "sl". Switchable in-app at any time. */
  defaultLanguage: "en",

  /* Parent PIN and family code are deliberately EMPTY here.
     This file is published with the site, so anything written in it is public.
     Instead each device asks for them once, on first run, and keeps them in that
     browser only — so a public repo gives away neither.
     Fill these in only if you are running a private copy and want to skip the
     first-run screen. */
  parentPin: "",

  /* Remote wipe. Change this string and every device clears its locally stored
     completions, payouts and added tasks the next time it loads the page — no
     tapping required. Useful for throwing away testing before you start for
     real, or if a phone ends up out of step.
     Local-only mode. Once Firebase is connected the shared database is the
     source of truth, so use Parent mode → Erase all data instead. */
  resetToken: "2026-08-30-clean",

  /* The folder your family's data lives in inside Firestore. Whoever knows this
     string can read and write your data, which is exactly why it is not stored
     here — the first-run screen asks for it and keeps it on the device.
     Pick something nobody would guess, e.g. "brajer-8f3k2m", and type the same
     code on every family device. */
  householdId: "",

  /* The Firestore database id. Firebase's default is the literal string
     "(default)", parentheses included. If you typed a name in the Database ID
     box when creating it, put that name here instead. */
  firestoreDatabaseId: "default",

  /* ------------------------------------------------------------------------
   *  Firebase — paste the 6 values from
   *  Firebase console → Project settings → Your apps → SDK setup → Config
   *  Leave them empty to stay in local-only mode.
   * ----------------------------------------------------------------------*/
  firebase: {
    apiKey:            "AIzaSyA3AIxjUXzYipgVR9mBFksgWQZGRbCCSwY",
    authDomain:        "allowance-90162.firebaseapp.com",
    projectId:         "allowance-90162",
    storageBucket:     "allowance-90162.firebasestorage.app",
    messagingSenderId: "256955945332",
    appId:             "1:256955945332:web:300f670b522789e3715c21"
  }
};
