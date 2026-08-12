"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Help/instruction popup for a service card.
 *
 * Built on the native <dialog> element rather than a hand-rolled overlay: the
 * browser gives focus trapping, Escape to close, inertness of the page behind,
 * and correct semantics for assistive tech — all the parts that hand-written
 * modals routinely get wrong.
 *
 * The body arrives as an already-rendered server element, so react-markdown
 * never reaches the client bundle.
 */
export function ServiceModal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // `close` fires for Escape and for the form-method close alike, so this is
  // the one place that needs to tell the parent the dialog went away.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  /**
   * Freeze the page behind the dialog.
   *
   * `showModal()` blocks interaction with the page but does NOT stop it
   * scrolling — on a phone, dragging anywhere outside the dialog scrolls the
   * portal underneath it. `overflow: hidden` alone isn't enough on iOS either,
   * so the body is pinned with `position: fixed` at its current offset and the
   * scroll position is restored on close, which is what stops the page jumping
   * back to the top when the dialog is dismissed.
   */
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="service-modal-title"
      // Clicking the backdrop closes it; the inner wrapper stops the click so
      // presses inside the content don't.
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="w-[min(42rem,calc(100vw-2rem))] rounded-lg border border-surface-border bg-surface-raised p-0 text-slate-200 backdrop:bg-black/60"
    >
      {/* overscroll-contain stops a scroll that reaches the end of the body
          from chaining out to the page behind it. */}
      <div className="flex max-h-[80vh] flex-col overscroll-contain">
        <div className="flex items-start gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="service-modal-title" className="text-base font-medium text-slate-100">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-slate-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="shrink-0 rounded-md px-2 py-1 text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
