/* Shared by the app page and the service worker: dates, seasons, schedules, storage. */
(function (g) {
  "use strict";
  const z = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  const today = () => ymd(new Date());
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);

  /* NZ seasons. 0 = summer watering rate, 1 = winter rate. */
  const MONTH_T = [0, 0, .6, .6, .6, 1, 1, 1, .4, .4, .4, 0];
  const SEASON = ["Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter", "Winter", "Winter", "Spring", "Spring", "Spring", "Summer"];
  const season = () => SEASON[new Date().getMonth()];

  const TASK = {
    water: { label: "Water", verb: "Watered", cls: "water" },
    feed: { label: "Feed", verb: "Fed", cls: "feed" },
    mist: { label: "Mist", verb: "Misted", cls: "water" },
    prune: { label: "Prune", verb: "Pruned", cls: "" },
    repot: { label: "Repot", verb: "Repotted", cls: "" },
    check: { label: "Health check", verb: "Checked over", cls: "" },
    custom: { label: "Task", verb: "Done", cls: "" }
  };
  const tLabel = t => t.label || (TASK[t.type] || TASK.custom).label;

  function waterEvery(p) {
    const c = p.care || {};
    const s = Math.max(1, +c.waterSummerDays || 3);
    const w = Math.max(s, +c.waterWinterDays || Math.max(s * 2, 7));
    let n = s + (w - s) * MONTH_T[new Date().getMonth()];
    if (p.setting === "ground") n *= 1.5;
    return Math.max(1, Math.round(n));
  }
  const every = (t, p) => (t.type === "water" && t.auto) ? waterEvery(p) : (+t.every || 0);
  function dueOf(t, p) {
    const n = every(t, p);
    let d = (t.last && n > 0) ? addDays(t.last, n) : (t.due || today());
    if (t.snooze && t.snooze > d) d = t.snooze;
    return d;
  }
  function allTasks(plants) {
    const out = [];
    for (const p of plants) for (const t of (p.tasks || [])) out.push({ p, t, due: dueOf(t, p) });
    return out.sort((a, b) => a.due.localeCompare(b.due) || a.p.name.localeCompare(b.p.name));
  }

  /* IndexedDB: store "kv" holds plants + settings; store "photos" holds journal photos. */
  function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("plant-keeper", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function tx(store, mode, fn) {
    return openDb().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      fn(t.objectStore(store));
      t.oncomplete = () => { d.close(); res(); };
      t.onerror = () => { d.close(); rej(t.error); };
      t.onabort = () => { d.close(); rej(t.error); };
    }));
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = {
    get: k => openDb().then(d => reqP(d.transaction("kv").objectStore("kv").get(k)).finally(() => d.close())),
    set: (k, v) => tx("kv", "readwrite", s => { s.put(v, k); }),
    photo: id => openDb().then(d => reqP(d.transaction("photos").objectStore("photos").get(id)).finally(() => d.close())),
    photosFor: pid => openDb().then(d => reqP(d.transaction("photos").objectStore("photos").getAll()).finally(() => d.close())).then(a => a.filter(x => x.plant === pid)),
    allPhotos: () => openDb().then(d => reqP(d.transaction("photos").objectStore("photos").getAll()).finally(() => d.close())),
    putPhoto: ph => tx("photos", "readwrite", s => { s.put(ph); }),
    delPhoto: id => tx("photos", "readwrite", s => { s.delete(id); })
  };

  /* Text for a reminder notification, or null when nothing is due. */
  function dueSummary(plants) {
    const t = today();
    const due = allTasks(plants || []).filter(x => x.due <= t);
    if (!due.length) return null;
    const names = due.slice(0, 4).map(x => tLabel(x.t) + " " + x.p.name).join(", ");
    return { count: due.length, body: names + (due.length > 4 ? " and " + (due.length - 4) + " more" : "") };
  }

  g.PK = { ymd, today, parse, addDays, dayDiff, season, SEASON, MONTH_T, TASK, tLabel, waterEvery, every, dueOf, allTasks, store, dueSummary };
})(self);
