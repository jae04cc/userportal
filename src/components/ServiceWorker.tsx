"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js.
 *
 * Renders nothing. Its only job is to get a service worker registered, which is
 * what makes Chrome consider the app installable and fire the
 * `beforeinstallprompt` that <InstallPrompt> waits for.
 *
 * Registration is deferred until after load: it is never on the critical path
 * for anything the user is waiting to see, and doing it early only competes for
 * bandwidth with the page itself.
 */
export function ServiceWorker() {
  useEffect(() => {
    // Absent on http:// over the LAN, since service workers need a secure
    // context. Behind the reverse proxy — which is how anyone actually reaches
    // this — it is always present.
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      // Failure here is not worth surfacing: the app works identically without
      // a worker, it just can't offer to install itself.
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
