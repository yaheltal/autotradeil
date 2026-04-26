// Web Push service worker.
//
// Registered on demand by PushNotificationsToggle. Receives push
// payloads from the backend (when sending is configured) and shows
// a native browser notification. Click navigates to the page named
// in the push payload's `url` field, falling back to /dashboard.
//
// Kept tiny on purpose — a fully featured offline cache lives in a
// future SW, not this one. Web Push needs only push + notificationclick.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "AutoTradeIL", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "AutoTradeIL";
  const options = {
    body: data.body || "",
    icon: data.icon || "/logo-icon.png",
    badge: data.badge || "/favicon-32x32.png",
    dir: "rtl",
    lang: "he",
    data: { url: data.url || "/dashboard" },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse an existing tab for the same origin if open.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
