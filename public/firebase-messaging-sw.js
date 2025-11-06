// Minimal background web-push handler for FCM
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = (data.notification && data.notification.title) || data.title || "Valley Airporter";
  const body  = (data.notification && data.notification.body)  || data.body  || "";
  const icon  = (data.notification && data.notification.icon)  || "/icons/icon-192.png";
  const url   = (data.notification && data.notification.click_action) || data.url || "/";

  event.waitUntil(self.registration.showNotification(title, { body, icon, data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.openWindow(url));
});
