"use client";

import { useEffect, type RefObject } from "react";

/**
 * While a modal is mounted, everything outside it inside the kiosk canvas is `inert`, so Tab cannot reach a
 * control hidden under the scrim (WCAG 2.4.11, docs/UI_QA.md "Focus"). Walks from the modal up to the canvas and
 * marks each ancestor's siblings; on unmount it clears only the ones it marked, so stacked modals unwind in order.
 */
export function useInertBackground(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const modal = ref.current;
    if (!modal) return;
    const stop = modal.closest("[data-kiosk-canvas]") ?? document.body;
    const marked: Element[] = [];
    for (let el: Element = modal; el !== stop && el.parentElement; el = el.parentElement) {
      for (const sibling of el.parentElement.children) {
        if (sibling !== el && !sibling.hasAttribute("inert")) {
          sibling.setAttribute("inert", "");
          marked.push(sibling);
        }
      }
    }
    return () => marked.forEach((s) => s.removeAttribute("inert"));
  }, [ref]);
}
