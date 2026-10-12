"use client";

import { useRef, type MouseEventHandler, type ReactNode } from "react";
import { useInertBackground } from "@/hooks/useInertBackground";

/** The full-canvas layer behind a sheet or dialog; the rest of the canvas is inert while it is open. */
export function ModalLayer(props: { className: string; onClick?: MouseEventHandler<HTMLDivElement>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useInertBackground(ref);
  return (
    <div ref={ref} className={props.className} onClick={props.onClick}>
      {props.children}
    </div>
  );
}
