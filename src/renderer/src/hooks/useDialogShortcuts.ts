import { useEffect, useRef, type RefObject } from "react";

/**
 * Selector for elements considered tab-stops inside the dialog. Excludes
 * anything explicitly removed from the tab order or disabled — matches
 * what the browser would naturally tab to.
 */
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "details > summary",
].join(", ");

interface DialogShortcutsOptions {
  /** Whether the dialog is currently mounted/open. */
  active: boolean;
  /** Ref to the dialog container — focus trap is scoped to its descendants. */
  containerRef: RefObject<HTMLElement>;
  /**
   * Identifier for the dialog's current phase. When this changes, the
   * hook re-checks where focus is — if the previously-focused button got
   * unmounted by the phase transition (Confirm gone after Copy starts,
   * etc.) we move focus back to the new primary so Tab still works.
   * Doesn't trigger focus when the active element is still inside the
   * container (avoids stealing focus from controls that survived).
   */
  phaseKey: string;
  /**
   * Called when the user presses Escape. The caller decides whether the
   * current phase is dismissible or cancellable; pass `null` to ignore Esc
   * entirely (e.g., during a destructive in-flight operation).
   */
  onEscape: (() => void) | null;
  /**
   * Called when the user presses Enter outside of an interactive element.
   * Pass `null` to ignore — useful in phases where Enter shouldn't auto-
   * confirm (e.g., copying, error).
   */
  onEnter: (() => void) | null;
}

/**
 * Modal a11y in one place: focus trap, Esc handling, Enter-to-confirm,
 * and initial-focus restoration. Every modal in the app should use this
 * — it's the difference between "dialog" and "dialog that feels native."
 *
 * Behaviour:
 *   - On mount, focuses the first non-disabled focusable element so the
 *     keyboard lands inside the dialog (otherwise focus stays in the
 *     element that triggered the modal, which is usually scrolled off-
 *     screen behind the backdrop).
 *   - Tab / Shift-Tab at the boundaries wraps to the other end so focus
 *     never escapes to the page behind.
 *   - Esc fires `onEscape` if non-null. Caller decides what that means
 *     (close, cancel, ignore).
 *   - Enter fires `onEnter` if non-null AND the active element isn't
 *     itself an interactive control that owns Enter (button click, form
 *     submit, textarea newline, link activation, details toggle).
 *   - On unmount, returns focus to whatever was focused before the
 *     dialog opened — so closing the dialog leaves the user where they
 *     were instead of losing their place.
 */
export function useDialogShortcuts({
  active,
  containerRef,
  phaseKey,
  onEscape,
  onEnter,
}: DialogShortcutsOptions): void {
  // Keep the latest callbacks in refs so the keyboard effect doesn't
  // re-bind on every phase change. Re-binding would re-run the cleanup,
  // which restores focus to the pre-dialog element — visible as a focus
  // flicker every time the dialog transitions from preflight → copying
  // → done.
  const onEscapeRef = useRef(onEscape);
  const onEnterRef = useRef(onEnter);
  onEscapeRef.current = onEscape;
  onEnterRef.current = onEnter;

  // Effect 1: keyboard listener + focus save/restore around the dialog's
  // entire lifetime. Only re-runs when the dialog opens or closes.
  useEffect(() => {
    if (!active) return;
    const containerEl: HTMLElement | null = containerRef.current;
    if (!containerEl) return;
    const container: HTMLElement = containerEl;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        const fn = onEscapeRef.current;
        if (fn) {
          e.preventDefault();
          fn();
        }
        return;
      }

      if (e.key === "Enter") {
        const fn = onEnterRef.current;
        if (!fn) return;
        const target = e.target as HTMLElement | null;
        if (isInteractiveActiveElement(target)) return;
        e.preventDefault();
        fn();
        return;
      }

      if (e.key !== "Tab") return;
      const items = focusable(container);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      // Restore focus to the trigger so the user lands where they were.
      // If the previously-focused element is gone (e.g., it was inside a
      // route that unmounted), HTMLElement.focus is a no-op — safe.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);

  // Effect 2: focus management on phase transitions. If a phase change
  // unmounts the focused button, focus lands on body — which would break
  // tab cycling. Detect that and pull focus back into the dialog.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      // Don't yank focus away from a still-valid control inside the dialog.
      if (container.contains(document.activeElement)) return;
      const items = focusable(container);
      const preferred =
        items.find((el) => el.classList.contains("sync-dialog__btn--primary")) ?? items[0];
      preferred?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, phaseKey, containerRef]);
}

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * True when the keyboard event landed on something that needs Enter for
 * its own behaviour — buttons (browser will fire click), links, form
 * controls, and <summary> (toggles details). Lets the browser do its
 * thing instead of swallowing Enter for the global "primary action."
 */
function isInteractiveActiveElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (
    tag === "BUTTON" ||
    tag === "A" ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "SUMMARY"
  ) {
    return true;
  }
  return el.isContentEditable;
}
