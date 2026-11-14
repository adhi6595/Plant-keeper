/* Plant Keeper service worker: works offline, and checks for due plant tasks in the background where the phone allows it. */
importScripts("./logic.js");
const CACHE = "plant-keeper-v1";
const FILES = ["./", "./index.html", "./logic.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (url.origin !== location.origin && !isFont) return;
  /* Show the saved copy at once, refresh it from the network in the background. */
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

async function remind(force) {
  const plants = (await PK.store.get("plants")) || [];
  const meta = (await PK.store.get("meta")) || {};
  if (!force && meta.notified === PK.today()) return;
  const s = PK.dueSummary(plants);
  if (!s) return;
  await self.registration.showNotification(s.count === 1 ? "1 plant task today" : s.count + " plant tasks today", {
    body: s.body, icon: "./icon-192.png", badge: "./icon-192.png", tag: "plant-daily", renotify: true, data: { url: "./#today" }
  });
  meta.notified = PK.today();
  await PK.store.set("meta", meta);
}
self.addEventListener("periodicsync", e => { if (e.tag === "plant-check") e.waitUntil(remind(false)); });
self.addEventListener("message", e => { if (e.data && e.data.type === "remind") e.waitUntil(remind(!!e.data.force)); });
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || "./");
  }));
});
