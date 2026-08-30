/* =============================================================================
 *  Allowance PWA
 *  Vanilla ES modules. Firestore when configured, localStorage otherwise.
 * ===========================================================================*/

const CFG = Object.assign({
  childName: "", goalAmount: 15, currency: "EUR", currencySymbol: "€",
  defaultLanguage: "en", parentPin: "", householdId: "", firebase: {}
}, window.APP_CONFIG || {});

const GOAL = Number(CFG.goalAmount) || 15;
const SYM  = CFG.currencySymbol || "€";

/* Parent PIN and family code live on the device, never in the published source.
   config.js can still supply them for a private copy, in which case the
   first-run screen is skipped. */
const SECRETS_KEY = "allowance.secrets.v1";
let secrets = (() => {
  try { return JSON.parse(localStorage.getItem(SECRETS_KEY)) || {}; } catch { return {}; }
})();
function saveSecrets(){
  try { localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets)); } catch {}
}
const householdId = () => secrets.householdId || CFG.householdId || "";
const parentPin   = () => secrets.parentPin   || CFG.parentPin   || "";
const cloudConfigured = () => !!(CFG.firebase && CFG.firebase.apiKey &&
                                 CFG.firebase.projectId && CFG.firebase.appId);

/* Remote wipe. When config.js carries a resetToken this device has not seen
   before, throw the local data away once and remember the token. Runs before
   any store is created. Preferences (language, theme, parent unlock) survive. */
(function applyResetToken(){
  const token = String(CFG.resetToken || "");
  if (!token) return;
  try {
    if (localStorage.getItem("allowance.resetToken") === token) return;
    localStorage.removeItem("allowance.data.v1");
    localStorage.setItem("allowance.resetToken", token);
    console.info("[allowance] local data cleared by resetToken:", token);
  } catch {}
})();

/* ---------------------------------------------------------------- tasks --- */
const BASE_TASKS = [
  { id:"dishwasher", emoji:"🍽️", cadence:"daily",  amount:1,
    en:"Dishwasher",           en_sub:"Empty or load it",
    sl:"Pomivalni stroj",      sl_sub:"Izprazni ali naloži" },
  { id:"kitchen",    emoji:"🧽", cadence:"daily",  amount:1,
    en:"Evening kitchen",      en_sub:"Clean up after dinner",
    sl:"Večerna kuhinja",      sl_sub:"Pospravi po večerji" },
  { id:"cat_litter", emoji:"🐱", cadence:"daily",  amount:1,
    en:"Cat toilet",           en_sub:"Kept clean all day",
    sl:"Mačji WC",             sl_sub:"Čist ves dan" },
  { id:"cat_sand",   emoji:"🧹", cadence:"daily",  amount:1,
    en:"Cat litter sand",      en_sub:"Vacuum around the box",
    sl:"Mačji pesek",          sl_sub:"Posesaj okoli WC-ja" },
  { id:"trash",      emoji:"🗑️", cadence:"daily",  amount:1,
    en:"Trash",                en_sub:"Take it out",
    sl:"Smeti",                sl_sub:"Odnesi ven" },
  { id:"store",      emoji:"🛒", cadence:"daily",  amount:1,
    en:"Store",                en_sub:"Go shopping",
    sl:"Trgovina",             sl_sub:"Pojdi po nakupih" },
  { id:"vacuum",     emoji:"🏠", cadence:"weekly", amount:4,
    en:"Apartment vacuuming",  en_sub:"The whole place",
    sl:"Sesanje stanovanja",   sl_sub:"Celo stanovanje" },
  { id:"bathroom",   emoji:"🛁", cadence:"weekly", amount:4,
    en:"Cleaning bathroom",    en_sub:"Sink, toilet, shower",
    sl:"Čiščenje kopalnice",   sl_sub:"Umivalnik, WC, tuš" }
];
/* Chores a parent added in Settings, and chores a parent removed. Both live in
   the shared database. Removal is deliberately a hide rather than a delete, so
   History keeps the name, emoji and amount of everything already earned. */
let custom    = [];
let removed   = new Set();
let amounts   = {};          // taskId -> reward, overriding the built-in value
let childName = "";
const resolvedChildName = () => childName || CFG.childName || "";

/* A reward the parent has edited wins over the task's built-in value. Past
   completions keep the amount they were worth on the day, because each stored
   completion carries its own, so changing a reward never rewrites history. */
const withAmount  = t => (t.id in amounts ? { ...t, amount: amounts[t.id] } : t);
const allTasks    = () => BASE_TASKS.concat(custom).map(withAmount);
const taskById    = id => allTasks().find(t => t.id === id) || null;
const isRemoved   = id => removed.has(id);
const activeTasks = () => allTasks().filter(t => !removed.has(t.id));
const sumOf = cadence => activeTasks().filter(t => t.cadence === cadence)
                                      .reduce((s, t) => s + t.amount, 0);
const dailyMax = () => sumOf("daily");
const weekMax  = () => dailyMax() * 7 + sumOf("weekly");

/* ----------------------------------------------------------------- i18n --- */
const I18N = {
  en:{
    brandSub:(n)=> n ? n+"’s chores" : "Family chores",
    tabTasks:"Tasks", tabDash:"Dashboard", tabHist:"History",
    balance:"Balance", ofGoal:"of goal", toGo:(x)=>`${x} to go`,
    goalReached:"Goal reached 🎉", goalReachedShort:"Goal reached",
    today:"today", thisWeek:"this week", dayStreak:"day streak",
    dailyTasks:"Daily tasks", weeklyTasks:"Weekly tasks",
    resetsMidnight:"one press per day · resets at midnight",
    resetsMonday:"one press per week · resets Monday",
    tapToEarn:"Tap to earn", done:"Done", doneToday:"Done today", doneThisWeek:"Done this week",
    footnote:(d,w)=>`Up to ${d} a day · ${w} in a perfect week`,
    currentBalance:"Current balance", payOut:"Pay out",
    goalLine:(b,g)=>`${b} / ${g} goal`,
    earnedAll:"Earned all-time", paidOut:"Paid out", weekCap:"This week", tasksDone:"Tasks done",
    last14:"Last 14 days", eachBar:"Each bar is one day of earnings",
    thisWeekTitle:"This week", perTask:"Per task — last 30 days",
    activity:"Activity", noActivity:"Nothing yet. Press a task button to get started.",
    settings:"Settings", language:"Language", appearance:"Appearance",
    themeAuto:"Auto", themeLight:"Light", themeDark:"Dark",
    deviceUsedBy:"This device is used by", whoChild:"Child", whoParent:"Parent",
    parentMode:"Parent mode",
    parentHint:"Unlock to pay out the balance and undo a task pressed by mistake.",
    parentOn:"Parent mode is on. Tap Lock to turn it off.",
    unlock:"Unlock", lock:"Lock", doneBtn:"Done",
    sync:"Sync",
    syncCloud:"Connected. Everything syncs live between all devices.",
    syncOffline:"Offline — your presses are saved and will sync when you are back online.",
    syncLocal:"Local only. Add your Firebase keys in config.js to sync between devices.",
    syncErr:"Not connected to the database — presses are saved on this device only. Check that Firestore and Anonymous sign-in are both enabled in Firebase.",
    chipCloud:"Synced", chipOffline:"Offline", chipLocal:"Local", chipErr:"Error",
    earned:(a,n)=>`+${a} · ${n}`,
    alreadyDone:"Already done for this period.",
    wrongPin:"Wrong PIN.", unlocked:"Parent mode unlocked.", locked:"Parent mode locked.",
    payoutPrompt:(b)=>`How much are you paying out? (balance ${b})`,
    payoutNote:"Paid out", payoutDone:(a)=>`${a} paid out.`,
    undoConfirm:(n)=>`Undo “${n}”? The money is removed from the balance.`,
    undone:"Undone.", undo:"Undo", needParent:"Turn on Parent mode in Settings first.",
    rewardLabel:"Reward",
    rewardSaved:(n,a)=>`${n} is now worth ${a}.`,
    badAmount:"The reward has to be between 0 and 99.",
    childLabel:"Child’s name", save:"Save",
    childHint:"Shown at the top of the app, on every device. Leave it empty for none.",
    childSaved:"Name saved.",
    manageTasks:"Tasks",
    manageHint:"Change what a chore is worth, or remove it from the list. A new reward applies only to future taps — money already earned stays as it was, and a removed chore keeps its History. Removed chores can be restored any time.",
    remove:"Remove", restore:"Restore", removedTag:"Removed",
    confirmRemove:(n)=>`Remove “${n}” from the task list?`,
    removedToast:(n)=>`“${n}” removed.`, restoredToast:(n)=>`“${n}” is back.`,
    allRemoved:"Every task has been removed. Add some back in Settings → Tasks.",
    perDay:"a day", perWeek:"a week",
    addTask:"Add a task", addTitle:"New task",
    fName:"Name", fEmoji:"Icon", fAmount:"Reward", fCadence:"Repeats",
    fDaily:"Daily", fWeekly:"Weekly", fAdd:"Add task", fCancel:"Cancel",
    needName:"Give the task a name.", needAmount:"The reward has to be more than 0.",
    addedToast:(n)=>`“${n}” added.`, customTag:"Added by you",
    resetTask:"Reset",
    confirmReset:(n)=>`Reset “${n}”? It becomes tappable again and the money comes off the balance.`,
    resetDone:(n)=>`“${n}” reset.`,
    parentResetHint:"Parent mode: tap a finished task to reset it.",
    dangerTitle:"Reset everything",
    dangerHint:"Deletes every completed task, every payout and any tasks you added, on all devices. The balance goes back to zero. This cannot be undone.",
    dangerBtn:"Erase all data",
    dangerConfirm1:"Erase ALL data — every completed task, every payout, the whole balance, on every device?",
    dangerConfirm2:"Last chance. This cannot be undone. Erase everything?",
    dangerDone:"All data erased.", working:"Working…",
    setupTitle:"Set up this device",
    setupIntro:"One quick step, kept on this device only — nothing here is stored in the published app.",
    lblCode:"Family code", lblSetupPin:"Parent PIN", setupGo:"Start",
    codeHint:"Type the same code on every family device — it is what links them to the same data. Pick something nobody would guess.",
    setupPinHint:"4–8 digits. Unlocks paying out, resetting a task and editing the task list.",
    setupErrPin:"The PIN must be 4–8 digits.",
    setupErrCode:"Enter a family code — at least 4 letters, digits or dashes.",
    reSetup:"Change PIN or family code",
    days:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    todayLabel:"Today", yesterdayLabel:"Yesterday",
    xTimes:(n)=>`${n}×`, notScheduled:"—", offlineSaved:"Saved offline — will sync later."
  },
  sl:{
    brandSub:(n)=> n ? "Opravila – "+n : "Družinska opravila",
    tabTasks:"Opravila", tabDash:"Pregled", tabHist:"Zgodovina",
    balance:"Stanje", ofGoal:"od cilja", toGo:(x)=>`še ${x} do cilja`,
    goalReached:"Cilj dosežen 🎉", goalReachedShort:"Cilj dosežen",
    today:"danes", thisWeek:"ta teden", dayStreak:"dni zapored",
    dailyTasks:"Dnevna opravila", weeklyTasks:"Tedenska opravila",
    resetsMidnight:"en pritisk na dan · ponastavi opolnoči",
    resetsMonday:"en pritisk na teden · ponastavi v ponedeljek",
    tapToEarn:"Pritisni", done:"Opravljeno", doneToday:"Opravljeno danes", doneThisWeek:"Opravljeno ta teden",
    footnote:(d,w)=>`Do ${d} na dan · ${w} v popolnem tednu`,
    currentBalance:"Trenutno stanje", payOut:"Izplačaj",
    goalLine:(b,g)=>`${b} / ${g} cilj`,
    earnedAll:"Skupaj zasluženo", paidOut:"Izplačano", weekCap:"Ta teden", tasksDone:"Opravljenih nalog",
    last14:"Zadnjih 14 dni", eachBar:"Vsak stolpec je en dan zaslužka",
    thisWeekTitle:"Ta teden", perTask:"Po opravilih — zadnjih 30 dni",
    activity:"Dogajanje", noActivity:"Še nič. Pritisni gumb opravila za začetek.",
    settings:"Nastavitve", language:"Jezik", appearance:"Videz",
    themeAuto:"Samodejno", themeLight:"Svetlo", themeDark:"Temno",
    deviceUsedBy:"To napravo uporablja", whoChild:"Otrok", whoParent:"Starš",
    parentMode:"Starševski način",
    parentHint:"Odkleni za izplačilo stanja in razveljavitev pomotoma pritisnjenega opravila.",
    parentOn:"Starševski način je vklopljen. Pritisni Zakleni za izklop.",
    unlock:"Odkleni", lock:"Zakleni", doneBtn:"Končano",
    sync:"Sinhronizacija",
    syncCloud:"Povezano. Vse se sproti sinhronizira med napravami.",
    syncOffline:"Brez povezave — pritiski so shranjeni in se bodo sinhronizirali kasneje.",
    syncLocal:"Samo lokalno. Vpiši Firebase ključe v config.js za sinhronizacijo.",
    syncErr:"Ni povezave z bazo — pritiski se shranjujejo samo na tej napravi. Preveri, da sta v Firebase vklopljena Firestore in anonimna prijava.",
    chipCloud:"Sinhrono", chipOffline:"Brez povezave", chipLocal:"Lokalno", chipErr:"Napaka",
    earned:(a,n)=>`+${a} · ${n}`,
    alreadyDone:"To obdobje je že opravljeno.",
    wrongPin:"Napačen PIN.", unlocked:"Starševski način odklenjen.", locked:"Starševski način zaklenjen.",
    payoutPrompt:(b)=>`Koliko izplačaš? (stanje ${b})`,
    payoutNote:"Izplačano", payoutDone:(a)=>`Izplačano ${a}.`,
    undoConfirm:(n)=>`Razveljavim „${n}“? Denar se odšteje od stanja.`,
    undone:"Razveljavljeno.", undo:"Razveljavi", needParent:"Najprej vklopi starševski način v nastavitvah.",
    rewardLabel:"Nagrada",
    rewardSaved:(n,a)=>`${n} je zdaj vreden ${a}.`,
    badAmount:"Nagrada mora biti med 0 in 99.",
    childLabel:"Otrokovo ime", save:"Shrani",
    childHint:"Prikazano na vrhu aplikacije, na vseh napravah. Pusti prazno, če ga nočeš.",
    childSaved:"Ime shranjeno.",
    manageTasks:"Opravila",
    manageHint:"Spremeni vrednost opravila ali ga odstrani s seznama. Nova nagrada velja samo za naprej — že prislužen denar ostane tak, kot je bil, odstranjeno opravilo pa obdrži svojo zgodovino. Odstranjena opravila lahko kadar koli vrneš.",
    remove:"Odstrani", restore:"Vrni", removedTag:"Odstranjeno",
    confirmRemove:(n)=>`Odstranim „${n}“ s seznama opravil?`,
    removedToast:(n)=>`„${n}“ odstranjeno.`, restoredToast:(n)=>`„${n}“ je nazaj.`,
    allRemoved:"Vsa opravila so odstranjena. Vrni jih v Nastavitve → Opravila.",
    perDay:"na dan", perWeek:"na teden",
    addTask:"Dodaj opravilo", addTitle:"Novo opravilo",
    fName:"Ime", fEmoji:"Ikona", fAmount:"Nagrada", fCadence:"Ponavljanje",
    fDaily:"Dnevno", fWeekly:"Tedensko", fAdd:"Dodaj", fCancel:"Prekliči",
    needName:"Opravilo potrebuje ime.", needAmount:"Nagrada mora biti večja od 0.",
    addedToast:(n)=>`„${n}“ dodano.`, customTag:"Dodal si sam",
    resetTask:"Ponastavi",
    confirmReset:(n)=>`Ponastavim „${n}“? Spet ga bo mogoče pritisniti, denar pa se odšteje od stanja.`,
    resetDone:(n)=>`„${n}“ ponastavljeno.`,
    parentResetHint:"Starševski način: pritisni opravljeno opravilo za ponastavitev.",
    dangerTitle:"Ponastavi vse",
    dangerHint:"Izbriše vsa opravljena opravila, vsa izplačila in opravila, ki si jih dodal — na vseh napravah. Stanje se vrne na nič. Tega ni mogoče razveljaviti.",
    dangerBtn:"Izbriši vse podatke",
    dangerConfirm1:"Izbrišem VSE podatke — vsa opravila, vsa izplačila, celotno stanje, na vseh napravah?",
    dangerConfirm2:"Zadnja možnost. Tega ni mogoče razveljaviti. Izbrišem vse?",
    dangerDone:"Vsi podatki izbrisani.", working:"Delam…",
    setupTitle:"Nastavi to napravo",
    setupIntro:"En hiter korak, shranjen samo na tej napravi — nič od tega ni v objavljeni aplikaciji.",
    lblCode:"Družinska koda", lblSetupPin:"Starševski PIN", setupGo:"Začni",
    codeHint:"Na vsaki družinski napravi vpiši isto kodo — ta jih poveže z istimi podatki. Izberi nekaj, česar nihče ne ugane.",
    setupPinHint:"4–8 številk. Odklene izplačila, ponastavitev opravila in urejanje seznama.",
    setupErrPin:"PIN mora imeti 4–8 številk.",
    setupErrCode:"Vpiši družinsko kodo — vsaj 4 črke, številke ali pomišljaje.",
    reSetup:"Spremeni PIN ali družinsko kodo",
    days:["Pon","Tor","Sre","Čet","Pet","Sob","Ned"],
    todayLabel:"Danes", yesterdayLabel:"Včeraj",
    xTimes:(n)=>`${n}×`, notScheduled:"—", offlineSaved:"Shranjeno brez povezave — sinhronizacija kasneje."
  }
};

/* ------------------------------------------------------------- prefs ------ */
const PREFS_KEY = "allowance.prefs.v1";
const prefs = Object.assign(
  { lang: CFG.defaultLanguage === "sl" ? "sl" : "en", theme:"auto", who:"child", parent:false },
  JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")
);
function savePrefs(){ localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
let L = I18N[prefs.lang] || I18N.en;

/* ------------------------------------------------------------- helpers ---- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const money = n => SYM + (Math.round(n*100)/100).toFixed(2).replace(/\.00$/, "");
const moneyExact = n => SYM + (Math.round(n*100)/100).toFixed(2);

function pad(n){ return n < 10 ? "0"+n : ""+n; }
function dateKey(d = new Date()){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function startOfDay(d = new Date()){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }

/** Monday-based week start. */
function startOfWeek(d = new Date()){
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7;          // 0 = Monday
  return addDays(x, -wd);
}
/** ISO-8601 week key, e.g. 2026-W35 */
function isoWeekKey(d = new Date()){
  const x = startOfDay(d);
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));   // Thursday of this week
  const week1 = new Date(x.getFullYear(), 0, 4);
  const diff  = (x - week1) / 86400000;
  const week  = 1 + Math.round((diff - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return x.getFullYear() + "-W" + pad(week);
}
function periodKey(task, d = new Date()){
  return task.cadence === "weekly" ? "w:" + isoWeekKey(d) : "d:" + dateKey(d);
}
function taskName(t){ return t.custom ? t.name : (t[prefs.lang] || t.en); }
function taskSub(t){ return t.custom ? (t.sub || "") : (t[prefs.lang + "_sub"] || t.en_sub); }

/* =============================================================================
 *  Storage layer
 *  Both back ends expose the same shape:
 *    mode        "cloud" | "local"
 *    status      "cloud" | "offline" | "local" | "error"
 *    data        { earned, paid, doneCount, completions[], payouts[] }
 *    subscribe(fn)
 *    complete(task)            -> throws "ALREADY_DONE"
 *    undo(completionId)
 *    payout(amount, note)
 * ===========================================================================*/

const HISTORY_DAYS = 70;          // how much detail we keep in memory / fetch

function makeEmitter(){
  const subs = new Set();
  return { subscribe(fn){ subs.add(fn); fn(); return () => subs.delete(fn); },
           emit(){ subs.forEach(fn => fn()); } };
}

/* ------------------------------------------------------------ local ------ */
function LocalStore(){
  const KEY = "allowance.data.v1";
  const em  = makeEmitter();
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  };
  const blank = () => ({ completions:[], payouts:[], removed:[], custom:[], amounts:{}, childName:"" });
  let db = Object.assign(blank(), load() || {});
  const persist = () => localStorage.setItem(KEY, JSON.stringify(db));

  const api = {
    mode:"local", status:"local", online:true,
    get data(){
      const earned = db.completions.reduce((s,c)=>s+c.amount,0);
      const paid   = db.payouts.reduce((s,p)=>s+p.amount,0);
      return { earned, paid, doneCount: db.completions.length,
               completions: db.completions, payouts: db.payouts,
               removed: db.removed || [], custom: db.custom || [],
               amounts: db.amounts || {}, childName: db.childName || "" };
    },
    subscribe: em.subscribe,
    async complete(task){
      const period = periodKey(task);
      const id = task.id + "__" + period;
      if (db.completions.some(c => c.id === id)) throw new Error("ALREADY_DONE");
      db.completions.push({ id, taskId:task.id, amount:task.amount, cadence:task.cadence,
                            period, by:prefs.who, ts:Date.now() });
      persist(); em.emit();
    },
    async undo(id){
      db.completions = db.completions.filter(c => c.id !== id);
      persist(); em.emit();
    },
    async payout(amount, note){
      db.payouts.push({ id:"p_"+Date.now(), amount, note, by:prefs.who, ts:Date.now() });
      persist(); em.emit();
    },
    async setConfig(patch){ Object.assign(db, patch); persist(); em.emit(); },
    async resetAll(){ db = blank(); persist(); em.emit(); }
  };
  // keep another tab in this browser in step
  window.addEventListener("storage", e => { if (e.key === KEY){ db = load() || db; em.emit(); } });
  return api;
}

/* ---------------------------------------------------------- firestore ---- */
async function CloudStore(){
  const SDK = "https://www.gstatic.com/firebasejs/11.6.0/";
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js")
  ]);

  const app = initializeApp(CFG.firebase);

  const DB_ID = CFG.firestoreDatabaseId || "(default)";

  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
    }, DB_ID);
  } catch { db = fs.getFirestore(app, DB_ID); }

  // Anonymous auth so security rules can require a signed-in user. If this
  // fails nothing can reach the server: Firestore listeners still fire from the
  // local cache, which would otherwise make the app look connected when it is
  // not. So the failure is recorded and reported rather than swallowed.
  let authed = false, authErr = "";
  try { await auth.signInAnonymously(auth.getAuth(app)); authed = true; }
  catch (e){
    authErr = e.code || e.message || String(e);
    console.warn("[allowance] anonymous sign-in failed:", authErr);
  }
  const netStatus = () => !authed ? "error" : (navigator.onLine ? "cloud" : "offline");

  const root  = ["households", householdId()];
  const cCol  = fs.collection(db, ...root, "completions");
  const pCol  = fs.collection(db, ...root, "payouts");
  const sRef  = fs.doc(db, ...root, "state", "main");

  const tRef  = fs.doc(db, ...root, "state", "tasks");

  const em = makeEmitter();
  const cache = { earned:0, paid:0, doneCount:0, completions:[], payouts:[], removed:[], custom:[], amounts:{}, childName:"" };
  let gotState = false;

  const api = {
    mode:"cloud", status:"cloud", online:navigator.onLine,
    get detail(){ return authErr; },
    get data(){
      // Before the totals doc exists (brand-new household) derive from the feed.
      if (!gotState){
        return { ...cache,
          earned: cache.completions.reduce((s,c)=>s+c.amount,0),
          paid:   cache.payouts.reduce((s,p)=>s+p.amount,0),
          doneCount: cache.completions.length };
      }
      return { ...cache };
    },
    subscribe: em.subscribe,

    async complete(task){
      const period = periodKey(task);
      const id  = task.id + "__" + period;
      const ref = fs.doc(cCol, id);
      await fs.runTransaction(db, async tx => {
        const c = await tx.get(ref);
        if (c.exists()) throw new Error("ALREADY_DONE");
        const s  = await tx.get(sRef);
        const d  = s.exists() ? s.data() : {};
        tx.set(ref, { taskId:task.id, amount:task.amount, cadence:task.cadence, period,
                      by:prefs.who, ts:Date.now(), serverTs:fs.serverTimestamp() });
        tx.set(sRef, { earnedTotal:(d.earnedTotal||0) + task.amount,
                       paidTotal:  (d.paidTotal||0),
                       doneCount:  (d.doneCount||0) + 1,
                       updatedAt:  fs.serverTimestamp() }, { merge:true });
      });
    },

    async undo(id){
      const ref = fs.doc(cCol, id);
      await fs.runTransaction(db, async tx => {
        const c = await tx.get(ref);
        if (!c.exists()) return;
        const amount = c.data().amount || 0;
        const s = await tx.get(sRef);
        const d = s.exists() ? s.data() : {};
        tx.delete(ref);
        tx.set(sRef, { earnedTotal:Math.max(0,(d.earnedTotal||0) - amount),
                       doneCount:  Math.max(0,(d.doneCount||0) - 1),
                       updatedAt:  fs.serverTimestamp() }, { merge:true });
      });
    },

    async payout(amount, note){
      const ref = fs.doc(pCol);
      await fs.runTransaction(db, async tx => {
        const s = await tx.get(sRef);
        const d = s.exists() ? s.data() : {};
        tx.set(ref, { amount, note, by:prefs.who, ts:Date.now(), serverTs:fs.serverTimestamp() });
        tx.set(sRef, { paidTotal:(d.paidTotal||0) + amount,
                       updatedAt:fs.serverTimestamp() }, { merge:true });
      });
    },

    async setConfig(patch){
      await fs.setDoc(tRef, { ...patch, updatedAt:fs.serverTimestamp() }, { merge:true });
    },

    /* Wipes the household clean: every completion, every payout, the running
       totals and the task customisations. */
    async resetAll(){
      for (const col of [cCol, pCol]){
        let snap;
        do {
          snap = await fs.getDocs(fs.query(col, fs.limit(400)));
          if (snap.empty) break;
          const batch = fs.writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        } while (snap.size === 400);
      }
      await fs.setDoc(sRef, { earnedTotal:0, paidTotal:0, doneCount:0,
                              updatedAt:fs.serverTimestamp() });
      await fs.setDoc(tRef, { removed:[], custom:[], amounts:{}, childName:"",
                              updatedAt:fs.serverTimestamp() });
    }
  };

  const since = startOfDay(addDays(new Date(), -HISTORY_DAYS)).getTime();

  fs.onSnapshot(sRef, snap => {
    if (snap.exists()){
      const d = snap.data();
      gotState = true;
      cache.earned    = d.earnedTotal || 0;
      cache.paid      = d.paidTotal   || 0;
      cache.doneCount = d.doneCount   || 0;
    }
    api.status = netStatus(); em.emit();
  }, err => { console.warn("[allowance] state listener:", err); api.status = "error"; em.emit(); });

  fs.onSnapshot(fs.query(cCol, fs.where("ts", ">=", since), fs.orderBy("ts", "desc")),
    snap => {
      cache.completions = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      api.status = netStatus(); em.emit();
    },
    err => { console.warn("[allowance] completions listener:", err); api.status = "error"; em.emit(); });

  fs.onSnapshot(tRef,
    snap => {
      const d = snap.exists() ? snap.data() : {};
      cache.removed   = d.removed || [];
      cache.custom    = d.custom  || [];
      cache.amounts   = d.amounts || {};
      cache.childName = d.childName || "";
      em.emit();
    },
    err => console.warn("[allowance] task-config listener:", err));

  fs.onSnapshot(fs.query(pCol, fs.orderBy("ts", "desc"), fs.limit(50)),
    snap => { cache.payouts = snap.docs.map(d => ({ id:d.id, ...d.data() })); em.emit(); },
    err => console.warn("[allowance] payouts listener:", err));

  api.status = netStatus();

  const netFlag = () => { api.status = netStatus(); em.emit(); };
  addEventListener("online", netFlag); addEventListener("offline", netFlag);

  return api;
}

/* ------------------------------------------------------------ chooser ---- */
async function createStore(){
  if (!cloudConfigured() || !householdId()) return LocalStore();
  try { return await CloudStore(); }
  catch (e){
    console.error("[allowance] Firebase failed, falling back to local storage:", e);
    const s = LocalStore(); s.status = "error"; return s;
  }
}

/* =============================================================================
 *  Derived values
 * ===========================================================================*/
function derive(data){
  const now = new Date();
  const todayK = dateKey(now);
  const weekStart = startOfWeek(now).getTime();

  const donePeriods = new Set();
  for (const c of data.completions) donePeriods.add(c.taskId + "__" + c.period);

  let today = 0, week = 0;
  const byDay = new Map();
  for (const c of data.completions){
    const k = dateKey(new Date(c.ts));
    byDay.set(k, (byDay.get(k) || 0) + c.amount);
    if (k === todayK) today += c.amount;
    if (c.ts >= weekStart) week += c.amount;
  }

  // streak: consecutive days with at least one completion, ending today or yesterday
  let streak = 0;
  let cursor = startOfDay(now);
  if (!byDay.get(dateKey(cursor))) cursor = addDays(cursor, -1);
  while (byDay.get(dateKey(cursor))){ streak++; cursor = addDays(cursor, -1); }

  const balance = data.earned - data.paid;
  return { balance, today, week, streak, byDay, donePeriods,
           earned:data.earned, paid:data.paid, doneCount:data.doneCount,
           atGoal: balance >= GOAL };
}

/* =============================================================================
 *  Rendering
 * ===========================================================================*/
let store = null;
let view  = "tasks";
let lastAtGoal = null;
let taskConfigSig = null;

function setFootnote(){
  setText("footnote", L.footnote(money(dailyMax()), money(weekMax())) +
                      (prefs.parent ? " · " + L.parentResetHint : ""));
}

function setText(id, value){ const el = document.getElementById(id); if (el) el.textContent = value; }

/* ---------------------------------------------------------- static text -- */
function renderChrome(){
  document.documentElement.lang = prefs.lang;
  setText("brandSub", L.brandSub(resolvedChildName()));
  setText("ttlDaily",  L.dailyTasks);   setText("capDaily",  L.resetsMidnight);
  setText("ttlWeekly", L.weeklyTasks);  setText("capWeekly", L.resetsMonday);
  setFootnote();
  setText("heroLabel", L.balance);      setText("ringCap",   L.ofGoal);
  setText("miniTodayCap", L.today); setText("miniWeekCap", L.thisWeek); setText("miniStreakCap", L.dayStreak);
  setText("bcLabel", L.currentBalance); setText("bcBadge", L.goalReachedShort);
  setText("payoutBtn", L.payOut);
  setText("sEarnedCap", L.earnedAll); setText("sPaidCap", L.paidOut);
  setText("sWeekCap", L.weekCap);     setText("sDoneCap", L.tasksDone);
  setText("chartTitle", L.last14);    setText("chartLegend", L.eachBar);
  setText("weekGridTitle", L.thisWeekTitle); setText("perTaskTitle", L.perTask);
  setText("histTitle", L.activity);
  setText("setTitle", L.settings); setText("setLang", L.language); setText("setTheme", L.appearance);
  setText("setWho", L.deviceUsedBy); setText("setParent", L.parentMode); setText("setSync", L.sync);
  setText("closeSheet", L.doneBtn);
  setText("setChild", L.childLabel);
  setText("childHint", L.childHint);
  setText("childSave", L.save);
  $("#nameRow").hidden = !prefs.parent;
  setText("setTasks", L.manageTasks);
  setText("tasksHint", L.manageHint);
  setText("addTaskBtn", L.addTask);
  setText("addTitle", L.addTitle);
  setText("lblName", L.fName);
  setText("lblEmoji", L.fEmoji);
  setText("lblAmount", `${L.fAmount} (${SYM})`);
  setText("lblCadence", L.fCadence);
  setText("dangerTitle", L.dangerTitle);
  setText("dangerHint", L.dangerHint);
  setText("dangerBtn", L.dangerBtn);
  $("#manageRow").hidden = $("#dangerRow").hidden = !prefs.parent;
  if (!prefs.parent) openAddForm(false);
  renderTaskManager();
  $$("[data-i18n]").forEach(el => { const v = L[el.dataset.i18n]; if (typeof v === "string") el.textContent = v; });
  $("#parentHint").textContent = prefs.parent ? L.parentOn : L.parentHint;
  $("#pinBtn").textContent = prefs.parent ? L.lock : L.unlock;
  $("#pinInput").hidden = prefs.parent;
  setText("reSetupBtn", L.reSetup);
  $("#reSetupBtn").hidden = !prefs.parent;
  renderSyncHint();
}

function renderSyncHint(){
  const st = store ? store.status : "local";
  const map = {
    cloud:   [L.chipCloud,   "ok",    L.syncCloud],
    offline: [L.chipOffline, "local", L.syncOffline],
    local:   [L.chipLocal,   "local", L.syncLocal],
    error:   [L.chipErr,     "err",   L.syncErr]
  };
  const [chip, cls, hint] = map[st] || map.local;
  setText("syncLabel", chip);
  $("#syncDot").className = "dot " + cls;
  const why = st === "error" && store && store.detail ? ` (${store.detail})` : "";
  $("#syncHint").textContent = hint + why;
}

/* ------------------------------------------------------- manage tasks --- */
function renderTaskManager(){
  const host = $("#taskManager");
  if (!host || !prefs.parent) return;
  host.innerHTML = allTasks().map(t => {
    const off = isRemoved(t.id);
    return `<div class="tm${off ? " off" : ""}">
        <span class="tm-em">${t.emoji}</span>
        <span class="tm-body">
          <span class="tm-name">${taskName(t)}</span>
          <span class="tm-meta">${t.cadence === "weekly" ? L.perWeek : L.perDay}${
            t.custom ? " · " + L.customTag : ""}${off ? " · " + L.removedTag : ""}</span>
        </span>
        <span class="tm-amt">
          <span class="tm-cur">${SYM}</span>
          <input type="text" inputmode="decimal" autocomplete="off" maxlength="5"
                 value="${t.amount}" data-amount="${t.id}" aria-label="${L.rewardLabel}"
                 ${off ? "disabled" : ""}>
        </span>
        <button class="tm-btn${off ? " restore" : ""}" data-toggle-task="${t.id}" type="button">${
          off ? L.restore : L.remove}</button>
      </div>`;
  }).join("");
}

async function toggleTask(id){
  if (!prefs.parent) return toast(L.needParent);
  const t = taskById(id);
  if (!t) return;
  const off  = isRemoved(id);
  if (!off && !confirm(L.confirmRemove(taskName(t)))) return;
  const next = off ? [...removed].filter(x => x !== id) : [...removed, id];
  await store.setConfig({ removed: next });
  removed = new Set(next);
  renderTaskManager();
  render();
  toast(off ? L.restoredToast(taskName(t)) : L.removedToast(taskName(t)));
}

async function saveAmount(input){
  if (!prefs.parent) return toast(L.needParent);
  const id = input.dataset.amount;
  const t  = taskById(id);
  if (!t) return;
  const raw   = String(input.value).trim().replace(",", ".");
  const value = Math.round(parseFloat(raw) * 100) / 100;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw) || !isFinite(value) || value <= 0 || value > 99){
    input.value = t.amount;
    return toast(L.badAmount);
  }
  if (value === t.amount) return;                 // nothing to save
  const next = { ...amounts, [id]: value };
  await store.setConfig({ amounts: next });
  amounts = next;
  setFootnote();
  render();
  toast(L.rewardSaved(taskName(t), money(value)));
}

/* --------------------------------------------------------- add a task --- */
function openAddForm(open){
  $("#addForm").hidden = !open;
  $("#addTaskBtn").hidden = open;
  if (open){ $("#fName").focus(); }
}

async function addTask(){
  if (!prefs.parent) return toast(L.needParent);
  const name   = $("#fName").value.trim();
  const emoji  = ($("#fEmoji").value.trim() || "⭐").slice(0, 4);
  const amount = Math.round(parseFloat(String($("#fAmount").value).trim().replace(",", ".")) * 100) / 100;
  const cadence = $("#fCadence").querySelector("button.on")?.dataset.cadence || "daily";

  if (!name)                        return toast(L.needName);
  if (!isFinite(amount) || amount <= 0) return toast(L.needAmount);

  const task = {
    id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, emoji, amount, cadence, custom: true, created: Date.now()
  };
  const next = [...custom.map(({ custom: _c, ...rest }) => rest), task];
  await store.setConfig({ custom: next });
  custom = next.map(t => ({ ...t, custom: true }));

  $("#fName").value = ""; $("#fEmoji").value = ""; $("#fAmount").value = "1";
  openAddForm(false);
  renderTaskManager();
  render();
  toast(L.addedToast(name));
}

async function saveChildName(){
  if (!prefs.parent) return toast(L.needParent);
  const name = $("#childInput").value.trim().slice(0, 24);
  await store.setConfig({ childName: name });
  childName = name;
  setText("brandSub", L.brandSub(resolvedChildName()));
  toast(L.childSaved);
}

/* ------------------------------------------------------ erase all data -- */
async function eraseAll(){
  if (!prefs.parent) return toast(L.needParent);
  if (!confirm(L.dangerConfirm1)) return;
  if (!confirm(L.dangerConfirm2)) return;
  const btn = $("#dangerBtn");
  btn.disabled = true; btn.textContent = L.working;
  try {
    await store.resetAll();
    removed = new Set(); custom = []; taskConfigSig = null; lastAtGoal = null;
    $$(".task-grid").forEach(g => g.dataset.sig = "");
    renderTaskManager(); render();
    toast(L.dangerDone);
  } catch (e){
    console.error(e); toast(String(e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = L.dangerBtn;
  }
}

/* --------------------------------------------------------------- tasks --- */
function tileHTML(t, done){
  const state = done ? (t.cadence === "weekly" ? L.doneThisWeek : L.doneToday) : L.tapToEarn;
  return `<button class="task${done ? " done" : ""}" data-task="${t.id}" ${done ? "disabled" : ""}>
      <span class="task-emoji">${t.emoji}</span>
      <span class="task-name">${taskName(t)}</span>
      ${taskSub(t) ? `<span class="task-sub">${taskSub(t)}</span>` : ""}
      <span class="task-foot">
        <span class="task-pay">${money(t.amount)}</span>
        <span class="task-state">${state}</span>
      </span>
    </button>`;
}
/* Tiles are built once per language and then updated in place, so pressing one
   does not tear down and rebuild the grid (which would drop keyboard focus and
   restart the animations on every other tile). */
function renderTasks(d){
  const live = activeTasks();
  $("#noTasks").hidden = live.length > 0;
  $("#noTasks").textContent = L.allRemoved;

  for (const [cadence, host] of [["daily", $("#dailyTasks")], ["weekly", $("#weeklyTasks")]]){
    const list = live.filter(t => t.cadence === cadence);
    const head = $(cadence === "daily" ? "#secDaily" : "#secWeekly");
    head.hidden = host.hidden = list.length === 0;

    const sig = prefs.lang + "|" + list.map(t => t.id + ":" + t.amount).join(",");
    if (host.dataset.sig !== sig){
      host.dataset.sig = sig;
      host.innerHTML = list.map(t => tileHTML(t, false)).join("");
    }
    list.forEach((t, i) => {
      const el   = host.children[i];
      const done = d.donePeriods.has(t.id + "__" + periodKey(t));
      const label = !done ? L.tapToEarn
                  : prefs.parent ? L.resetTask
                  : t.cadence === "weekly" ? L.doneThisWeek : L.doneToday;
      const want = `${done}|${prefs.parent}|${label}`;
      if (el.dataset.state === want) return;
      el.dataset.state = want;
      el.classList.toggle("done", done);
      el.classList.toggle("resettable", done && prefs.parent);
      el.disabled = done && !prefs.parent;
      el.querySelector(".task-state").textContent = label;
    });
  }
}

/* ---------------------------------------------------------------- hero --- */
function renderHero(d){
  const pct = Math.max(0, Math.min(1, d.balance / GOAL));
  const C = 2 * Math.PI * 52;
  $("#ringFill").style.strokeDasharray  = C;
  $("#ringFill").style.strokeDashoffset = C * (1 - pct);
  setText("ringPct", Math.round(pct * 100) + "%");
  setText("heroAmount", moneyExact(d.balance));
  setText("heroGoal", d.atGoal ? L.goalReached : L.toGo(money(GOAL - d.balance)));
  setText("miniToday", money(d.today));
  setText("miniWeek",  money(d.week));
  setText("miniStreak", d.streak);
  $("#hero").classList.toggle("goal", d.atGoal);
}

/* ----------------------------------------------------------- dashboard --- */
function renderDashboard(d){
  const card = $("#balanceCard");
  card.classList.toggle("goal", d.atGoal);
  $("#bcBadge").hidden = !d.atGoal;
  setText("bcAmount", moneyExact(d.balance));
  const scale = Math.max(GOAL, d.balance);
  $("#bcBar").style.width = (d.balance / scale) * 100 + "%";
  $("#bcGoalTick").style.left = (GOAL / scale) * 100 + "%";
  setText("bcFootLeft", L.goalLine(money(d.balance), money(GOAL)));
  setText("bcFootRight", d.atGoal ? L.goalReached : "");
  $("#bcActions").hidden = !(prefs.parent && d.balance > 0);

  setText("sEarned", money(d.earned));
  setText("sPaid",   money(d.paid));
  setText("sWeek",   money(d.week));
  setText("sDone",   d.doneCount);

  /* 14-day chart */
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(addDays(startOfDay(new Date()), -i));
  const vals = days.map(x => d.byDay.get(dateKey(x)) || 0);
  const max  = Math.max(dailyMax() || 1, ...vals);
  $("#chart").innerHTML = days.map((x, i) => {
    const v = vals[i], isToday = i === days.length - 1;
    return `<div class="col${isToday ? " today" : ""}${v ? "" : " empty"}">
        <span class="colval">${v ? money(v) : ""}</span>
        <span class="colbar" style="height:${Math.max(4, (v / max) * 108)}px"></span>
        <span class="collab">${L.days[(x.getDay() + 6) % 7]}</span>
      </div>`;
  }).join("");

  /* week matrix */
  const ws = startOfWeek(new Date());
  const cols = Array.from({ length:7 }, (_, i) => addDays(ws, i));
  const todayK = dateKey(new Date());
  let html = `<div></div>` + cols.map(c =>
    `<div class="mh">${L.days[(c.getDay() + 6) % 7]}</div>`).join("");
  const doneOnDay = new Set(
    (store.data.completions || []).map(c => c.taskId + "@" + dateKey(new Date(c.ts))));
  for (const t of activeTasks()){
    html += `<div class="mn" title="${taskName(t)}">${t.emoji}<span>${taskName(t)}</span></div>`;
    html += cols.map(c => {
      const k = dateKey(c);
      const future = c > new Date();
      const on = doneOnDay.has(t.id + "@" + k);
      const cls = on ? "on" : (future ? "na" : "");
      return `<div class="cellwrap"><div class="cell ${cls}${k === todayK ? " today" : ""}"></div></div>`;
    }).join("");
  }
  $("#matrix").innerHTML = html;

  /* per-task, last 30 days */
  const from = startOfDay(addDays(new Date(), -29)).getTime();
  const agg = {};
  for (const c of store.data.completions) if (c.ts >= from)
    agg[c.taskId] = { n:(agg[c.taskId]?.n || 0) + 1, sum:(agg[c.taskId]?.sum || 0) + c.amount };
  const live = activeTasks();
  const top = Math.max(1, ...live.map(t => agg[t.id]?.sum || 0));
  $("#perTask").innerHTML = live.map(t => {
    const a = agg[t.id] || { n:0, sum:0 };
    return `<div class="pt">
        <span class="pt-em">${t.emoji}</span>
        <div class="pt-mid"><span class="pt-name">${taskName(t)}</span>
          <span class="pt-bar"><span style="width:${(a.sum / top) * 100}%"></span></span></div>
        <span class="pt-val">${L.xTimes(a.n)} · ${money(a.sum)}</span>
      </div>`;
  }).join("");
}

/* ------------------------------------------------------------- history --- */
function renderHistory(){
  const data  = store.data;
  const items = [
    ...data.completions.map(c => ({ kind:"task", ...c })),
    ...data.payouts.map(p => ({ kind:"payout", ...p }))
  ].sort((a, b) => b.ts - a.ts).slice(0, 150);

  if (!items.length){ $("#timeline").innerHTML = `<p class="empty-state">${L.noActivity}</p>`; return; }

  const todayK = dateKey(new Date());
  const yestK  = dateKey(addDays(new Date(), -1));
  const fmtDay = k => k === todayK ? L.todayLabel : k === yestK ? L.yesterdayLabel
    : new Date(k + "T12:00:00").toLocaleDateString(prefs.lang === "sl" ? "sl-SI" : "en-GB",
        { weekday:"long", day:"numeric", month:"long" });
  const fmtTime = ts => new Date(ts).toLocaleTimeString(prefs.lang === "sl" ? "sl-SI" : "en-GB",
        { hour:"2-digit", minute:"2-digit" });

  let html = "", day = null;
  for (const it of items){
    const k = dateKey(new Date(it.ts));
    if (k !== day){ day = k; html += `<div class="tl-day">${fmtDay(k)}</div>`; }
    if (it.kind === "task"){
      const t = taskById(it.taskId) || { emoji:"✅", en:it.taskId, sl:it.taskId };
      html += `<div class="tl-item">
          <span class="tl-em">${t.emoji}</span>
          <span class="tl-body"><span class="tl-name">${taskName(t)}</span>
            <span class="tl-meta">${fmtTime(it.ts)}</span></span>
          <span class="tl-amt">+${money(it.amount)}</span>
          ${prefs.parent ? `<button class="tl-undo" data-undo="${it.id}">${L.undo}</button>` : ""}
        </div>`;
    } else {
      html += `<div class="tl-item payout">
          <span class="tl-em">💶</span>
          <span class="tl-body"><span class="tl-name">${L.payoutNote}</span>
            <span class="tl-meta">${fmtTime(it.ts)}</span></span>
          <span class="tl-amt">−${money(it.amount)}</span>
        </div>`;
    }
  }
  $("#timeline").innerHTML = html;
}

/* -------------------------------------------------------------- render --- */
function render(){
  if (!store) return;
  const data = store.data;
  const sig  = JSON.stringify([data.removed || [], data.custom || [],
                               data.amounts || {}, data.childName || ""]);
  if (sig !== taskConfigSig){
    taskConfigSig = sig;
    removed   = new Set(data.removed || []);
    custom    = (data.custom || []).map(t => ({ ...t, custom:true }));
    amounts   = data.amounts || {};
    childName = data.childName || "";
    setText("brandSub", L.brandSub(resolvedChildName()));
    $("#childInput").value = childName;
    setFootnote();
    renderTaskManager();
  }
  const d = derive(data);
  renderHero(d);
  renderTasks(d);
  if (view === "dashboard") renderDashboard(d);
  if (view === "history")   renderHistory();
  renderSyncHint();

  if (lastAtGoal === false && d.atGoal) celebrate();
  lastAtGoal = d.atGoal;
}

/* =============================================================================
 *  Feedback: toast + confetti
 * ===========================================================================*/
let toastTimer;
function toast(msg){
  const el = $("#toast");
  $("#toastText").textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function haptic(ms = 12){ if (navigator.vibrate) try { navigator.vibrate(ms); } catch {} }

function celebrate(){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("#confetti"), ctx = cv.getContext("2d");
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
  ctx.scale(dpr, dpr);
  const colors = ["#34c759", "#0a84ff", "#6aa9ff", "#ffd60a", "#ffffff"];
  const bits = Array.from({ length:120 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 180,
    y: innerHeight * .34,
    vx:(Math.random() - .5) * 9,
    vy:-Math.random() * 12 - 4,
    s: 5 + Math.random() * 7,
    r: Math.random() * Math.PI,
    vr:(Math.random() - .5) * .3,
    c: colors[(Math.random() * colors.length) | 0]
  }));
  const t0 = performance.now();
  (function frame(t){
    const el = t - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits){
      b.vy += .32; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.globalAlpha = Math.max(0, 1 - el / 2600);
      ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * .6);
      ctx.restore();
    }
    if (el < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
  haptic([18, 60, 18, 60, 30]);
}

/* =============================================================================
 *  Interactions
 * ===========================================================================*/
async function resetTask(t){
  if (!confirm(L.confirmReset(taskName(t)))) return;
  await store.undo(t.id + "__" + periodKey(t));
  lastAtGoal = null;
  toast(L.resetDone(taskName(t)));
  render();
}

async function pressTask(btn){
  const t = taskById(btn.dataset.task);
  if (!t || btn.classList.contains("busy")) return;
  if (btn.classList.contains("done")) return prefs.parent ? resetTask(t) : undefined;
  btn.classList.add("busy");
  haptic();
  try {
    await store.complete(t);
    toast(L.earned(money(t.amount), taskName(t)));
    render();
    const fresh = $(`[data-task="${t.id}"]`);
    if (fresh) fresh.classList.add("flash");
  } catch (e){
    if (String(e.message).includes("ALREADY_DONE")) toast(L.alreadyDone);
    else { console.error(e); toast(L.offlineSaved); }
    render();
  } finally {
    const b = $(`[data-task="${t.id}"]`);
    if (b) b.classList.remove("busy");
  }
}

async function doPayout(){
  if (!prefs.parent) return toast(L.needParent);
  const d = derive(store.data);
  const raw = prompt(L.payoutPrompt(moneyExact(d.balance)), String(Math.round(d.balance * 100) / 100));
  if (raw === null) return;
  const amount = Math.round(parseFloat(String(raw).replace(",", ".")) * 100) / 100;
  if (!isFinite(amount) || amount <= 0) return;
  await store.payout(amount, L.payoutNote);
  lastAtGoal = null;
  toast(L.payoutDone(money(amount)));
  render();
}

async function doUndo(id){
  if (!prefs.parent) return toast(L.needParent);
  const c = store.data.completions.find(x => x.id === id);
  const t = c ? taskById(c.taskId) : null;
  if (!confirm(L.undoConfirm(t ? taskName(t) : "?"))) return;
  await store.undo(id);
  lastAtGoal = null;
  toast(L.undone);
  render();
}

function switchView(name){
  view = name;
  $$(".view").forEach(v => { v.hidden = v.id !== "view-" + name; });
  $$(".tab").forEach(b => b.classList.toggle("is-active", b.dataset.view === name));
  scrollTo({ top:0, behavior:"smooth" });
  render();
}

/* --------------------------------------------------------------- theme --- */
function applyTheme(){
  document.documentElement.dataset.theme = prefs.theme;
  const dark = prefs.theme === "dark" ||
    (prefs.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $$('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement("meta");
  m.name = "theme-color"; m.content = dark ? "#0a1220" : "#eef4ff";
  document.head.appendChild(m);
}
function syncSegments(){
  $$("#langSeg button").forEach(b => b.classList.toggle("on", b.dataset.lang === prefs.lang));
  $$("#themeSeg button").forEach(b => b.classList.toggle("on", b.dataset.theme === prefs.theme));
  $$("#whoSeg button").forEach(b => b.classList.toggle("on", b.dataset.who === prefs.who));
}

/* --------------------------------------------------------------- setup --- */
function needsSetup(){
  if (!parentPin()) return true;
  if (cloudConfigured() && !householdId()) return true;
  return false;
}

function runSetup(){
  return new Promise(resolve => {
    const cloud = cloudConfigured();
    setText("setupTitle", L.setupTitle);
    setText("setupIntro", L.setupIntro);
    setText("lblCode", L.lblCode);
    setText("codeHint", L.codeHint);
    setText("lblSetupPin", L.lblSetupPin);
    setText("setupPinHint", L.setupPinHint);
    setText("setupGo", L.setupGo);
    $("#codeField").hidden = !cloud;
    $("#setupCode").value  = householdId();
    $("#setupPin").value   = "";
    $("#setup").hidden     = false;

    const go = () => {
      const pin  = $("#setupPin").value.trim();
      const code = $("#setupCode").value.trim();
      if (!/^\d{4,8}$/.test(pin))            return toast(L.setupErrPin);
      if (cloud && !/^[\w-]{4,}$/.test(code)) return toast(L.setupErrCode);
      secrets.parentPin = pin;
      if (cloud) secrets.householdId = code;
      saveSecrets();
      $("#setup").hidden = true;
      $("#setupGo").removeEventListener("click", go);
      $("#setupPin").removeEventListener("keydown", onKey);
      resolve();
    };
    const onKey = e => { if (e.key === "Enter") go(); };
    $("#setupGo").addEventListener("click", go);
    $("#setupPin").addEventListener("keydown", onKey);
    setTimeout(() => $(cloud && !householdId() ? "#setupCode" : "#setupPin").focus(), 80);
  });
}

/* --------------------------------------------------------------- sheet --- */
function openSheet(){ $("#sheet").hidden = false; $("#scrim").hidden = false; syncSegments(); renderChrome(); }
function closeSheet(){ $("#sheet").hidden = true;  $("#scrim").hidden = true; }

/* =============================================================================
 *  Wiring
 * ===========================================================================*/
function wire(){
  document.addEventListener("click", e => {
    const tog = e.target.closest("[data-toggle-task]");
    if (tog) return toggleTask(tog.dataset.toggleTask);
    const tile = e.target.closest("[data-task]");
    if (tile) return pressTask(tile);
    const undo = e.target.closest("[data-undo]");
    if (undo) return doUndo(undo.dataset.undo);
    const tab = e.target.closest(".tab");
    if (tab) return switchView(tab.dataset.view);
  });

  $("#payoutBtn").addEventListener("click", doPayout);
  $("#addTaskBtn").addEventListener("click", () => openAddForm(true));
  $("#cancelAdd").addEventListener("click", () => openAddForm(false));
  $("#saveAdd").addEventListener("click", addTask);
  $("#dangerBtn").addEventListener("click", eraseAll);
  $("#childSave").addEventListener("click", saveChildName);
  $("#taskManager").addEventListener("change", e => {
    const input = e.target.closest("[data-amount]");
    if (input) saveAmount(input);
  });
  $("#taskManager").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.closest("[data-amount]")) e.target.blur();
  });
  $("#childInput").addEventListener("keydown", e => { if (e.key === "Enter") saveChildName(); });
  $("#reSetupBtn").addEventListener("click", async () => {
    if (!prefs.parent) return toast(L.needParent);
    closeSheet();
    await runSetup();
    location.reload();          // the family code may have changed
  });
  $("#fName").addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });
  $("#fAmount").addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });
  $("#fCadence").addEventListener("click", e => {
    const b = e.target.closest("[data-cadence]"); if (!b) return;
    $$("#fCadence button").forEach(x => x.classList.toggle("on", x === b));
  });
  $("#settingsBtn").addEventListener("click", openSheet);
  $("#syncChip").addEventListener("click", openSheet);
  $("#scrim").addEventListener("click", closeSheet);
  $("#closeSheet").addEventListener("click", closeSheet);

  $("#langSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-lang]"); if (!b) return;
    prefs.lang = b.dataset.lang; L = I18N[prefs.lang]; savePrefs();
    syncSegments(); renderChrome();
    render();
  });
  $("#themeSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-theme]"); if (!b) return;
    prefs.theme = b.dataset.theme; savePrefs(); applyTheme(); syncSegments();
  });
  $("#whoSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-who]"); if (!b) return;
    prefs.who = b.dataset.who; savePrefs(); syncSegments();
  });
  $("#pinBtn").addEventListener("click", () => {
    if (prefs.parent){ prefs.parent = false; savePrefs(); renderChrome(); render(); return toast(L.locked); }
    const val = $("#pinInput").value.trim();
    if (val && val === String(parentPin())){
      prefs.parent = true; savePrefs(); $("#pinInput").value = "";
      renderChrome(); render(); toast(L.unlocked);
    } else toast(L.wrongPin);
  });
  $("#pinInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#pinBtn").click(); });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (prefs.theme === "auto") applyTheme();
  });

  /* day / week rollover — re-render when the period key changes */
  let stamp = dateKey() + "|" + isoWeekKey();
  const tick = () => {
    const now = dateKey() + "|" + isoWeekKey();
    if (now !== stamp){ stamp = now; render(); }
  };
  setInterval(tick, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  addEventListener("focus", tick);
}

/* =============================================================================
 *  Boot
 * ===========================================================================*/
(async function boot(){
  applyTheme();
  renderChrome();
  syncSegments();
  wire();

  if (needsSetup()) await runSetup();

  store = await createStore();
  lastAtGoal = derive(store.data).atGoal;   // don't fire confetti on first paint
  store.subscribe(render);
  render();

  // boot() is async, so "load" may already have fired by now — register directly.
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")){
    navigator.serviceWorker.register("sw.js")
      .catch(e => console.warn("[allowance] service worker not registered:", e.message));
  }
})();
