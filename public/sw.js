self.addEventListener("push", (event) => {
  let data = {
    title: "TrustTicker",
    body: "New catalyst alert",
    url: "/dashboard?view=monitor",
    symbol: null,
    catalystId: null,
    actionsEnabled: true,
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore */
  }

  const actions = data.actionsEnabled
    ? [
        { action: "open", title: "Open" },
        { action: "mute", title: "Mute" },
        { action: "watchlist", title: "Watchlist" },
        { action: "evidence", title: "Evidence" },
      ]
    : [];

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-32.png",
      data: {
        url: data.url || "/dashboard?view=monitor",
        symbol: data.symbol,
        catalystId: data.catalystId,
      },
      vibrate: [80, 40, 80],
      actions,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action || "open";
  const symbol = event.notification.data?.symbol || "";
  const catalystId = event.notification.data?.catalystId || "";
  let url = event.notification.data?.url || "/dashboard?view=monitor";

  if (action === "mute" && symbol) {
    url = `/dashboard?view=monitor&mute=${encodeURIComponent(symbol)}`;
  } else if (action === "watchlist" && symbol) {
    url = `/dashboard?view=watchlist&symbol=${encodeURIComponent(symbol)}`;
  } else if (action === "evidence" && (catalystId || symbol)) {
    url = catalystId
      ? `/dashboard?view=feed&focus=1&evidence=${encodeURIComponent(catalystId)}`
      : `/dashboard?view=monitor&symbol=${encodeURIComponent(symbol)}`;
  } else if (symbol) {
    url = url.includes("?")
      ? `${url}&symbol=${encodeURIComponent(symbol)}`
      : `${url}?symbol=${encodeURIComponent(symbol)}`;
  }

  if (url.startsWith("/")) {
    url = self.location.origin + url;
  }

  // Notify open clients for same-tab handling
  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of list) {
        try {
          client.postMessage({
            type: "tt-notification-action",
            action,
            symbol,
            catalystId,
            url,
          });
        } catch {
          /* ignore */
        }
        if ("focus" in client) {
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore */
            }
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
