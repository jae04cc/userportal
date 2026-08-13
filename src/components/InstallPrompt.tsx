"use client";

import { useCallback, useEffect, useState } from "react";
import {
  chooseInstallOffer,
  isInstalled,
  isIosBrowser,
  INSTALL_DISMISSED_KEY,
  type InstallOffer,
} from "@/lib/install";

/** Chrome's install event. Not in lib.dom, because it isn't a standard. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Offers to install the portal as an app.
 *
 * Renders nothing at all on the server and on first paint, then decides once
 * mounted. That ordering is deliberate: whether to show this depends entirely
 * on the browser and on an event Chrome fires asynchronously, so anything
 * rendered up front would either be wrong or would flash and vanish.
 *
 * Dismissing is remembered permanently. This is a home portal used by a handful
 * of people every day — being asked twice is worse than never being asked.
 */
export function InstallPrompt({ appName }: { appName: string }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [iosBrowser, setIosBrowser] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    // `standalone` is Apple's own, and isn't on lib.dom's Navigator.
    const nav = navigator as Navigator & { standalone?: boolean };
    setInstalled(isInstalled(window, nav));
    setIosBrowser(isIosBrowser(nav));

    try {
      setDismissed(window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1");
    } catch {
      // Private browsing can throw on localStorage. Treat that as "not
      // dismissed" rather than suppressing the offer entirely.
      setDismissed(false);
    }

    const onBeforeInstall = (event: Event) => {
      // Without this Chrome shows its own mini-infobar and this component
      // never gets the chance to ask at a sensible moment.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // Not being able to remember it is not a reason to keep it on screen.
    }
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event is single-use either way, so it goes regardless of the answer.
    setPromptEvent(null);
    // "Not now" means not now, not never — only a deliberate ✕ is permanent.
    if (outcome === "accepted") dismiss();
  }, [promptEvent, dismiss]);

  const offer: InstallOffer = chooseInstallOffer({
    installed,
    dismissed,
    hasPromptEvent: promptEvent !== null,
    iosBrowser,
  });

  if (offer === "none") return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-surface-border bg-surface-raised px-4 py-3">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium text-slate-200">Install {appName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {offer === "prompt"
            ? "Adds it to your home screen or Start menu, and opens it in its own window."
            : "Tap the Share button below, then “Add to Home Screen”."}
        </p>
      </div>

      {offer === "prompt" ? (
        <button
          type="button"
          onClick={() => void install()}
          className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-sky-500"
        >
          Install
        </button>
      ) : null}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Don't show this again"
        className="rounded-md border border-surface-border px-2 py-1 text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200"
      >
        ✕
      </button>
    </div>
  );
}
