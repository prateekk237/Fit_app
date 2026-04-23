// Web Push handlers for Fit. This file is merged into the Workbox-
// generated service worker via next-pwa's importScripts option.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (_err) {
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch {
      /* ignore */
    }
  }

  const title = data.title || "Fit";
  const body = data.body || "";
  const tag = data.tag || "fit-alert";
  const url = data.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      requireInteraction: data.priority === "urgent",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client && client.url.includes(target)) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return null;
    }),
  );
});
