"use client";

import { ArrowLeft, Camera, Flashlight, FlashlightOff, Link2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { InAppNote } from "@/components/app/InAppNote";
import { CARD, FOCUS, ICON, PRIMARY, QUIET, SECONDARY, SECONDARY_SMALL } from "@/components/phone/ui";
import { usePhoneSettings } from "@/hooks/usePhoneSettings";
import { pt } from "@/lib/i18n/phone";
import { assistantHref, parseKioskQr } from "@/lib/phone/kioskQr";
import { createQrDecoder } from "@/lib/phone/qrDecode";
import type { Locale } from "@/types/menu";

// /app/scan (12-phone-app:3): the kiosk's QR through the phone camera, then straight into /assistant, where the
// claim runs and the microphone hint follows. The camera starts only after a tap and stops on success and on leave.
// Only this app's own claim URL is opened (parseKioskQr), and always rebuilt from its checked parts.

type ScanState = "hint" | "starting" | "scanning" | "found" | "unavailable";

/** About 8 decodes a second: enough to feel instant, light on an older phone. */
const FRAME_MS = 125;

export function ScanApp() {
  const { locale } = usePhoneSettings();
  const [state, setState] = useState<ScanState>("hint");
  const [foreign, setForeign] = useState(false);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runningRef = useRef(false);

  function stopCamera() {
    runningRef.current = false;
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function open(text: string): boolean {
    const qr = parseKioskQr(text, window.location.origin);
    if ("error" in qr) {
      setForeign(true);
      return false;
    }
    stopCamera();
    navigator.vibrate?.(60);
    setState("found");
    // A full load, so /assistant reads the claim token from the fragment and removes it, as for any QR link.
    window.location.assign(assistantHref(qr));
    return true;
  }

  async function startCamera() {
    setForeign(false);
    setState("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch({ available: caps.torch === true, on: false });
      const decode = await createQrDecoder();
      setState("scanning");
      runningRef.current = true;
      const tick = async () => {
        if (!runningRef.current) return;
        const text = await decode(video).catch(() => null);
        if (text && open(text)) return;
        if (runningRef.current) timerRef.current = setTimeout(() => void tick(), FRAME_MS);
      };
      void tick();
    } catch {
      // Denied, no camera, or no camera API (an in-app browser): the phone's camera app or a pasted link still work.
      stopCamera();
      setState("unavailable");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ available: true, on });
    } catch {
      setTorch({ available: false, on: false });
    }
  }

  // Leaving the page, switching apps or locking the screen stops the camera; a tap starts it again.
  useEffect(() => {
    const onHide = () => {
      if (!streamRef.current) return;
      stopCamera();
      setState((s) => (s === "found" ? s : "hint"));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      stopCamera();
    };
  }, []);

  const live = state === "starting" || state === "scanning";

  return (
    <main data-scan-state={state} className="flex min-h-dvh flex-1 flex-col bg-cream px-4 py-4 text-ink">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="flex items-center gap-2">
          <Link href="/app" className={`${QUIET} -ml-3`}>
            <ArrowLeft {...ICON} />
            {pt("backHome", locale)}
          </Link>
        </div>
        <h1 className="text-2xl leading-tight font-bold">{pt("scanTitle", locale)}</h1>
        <InAppNote locale={locale} />

        {state === "hint" && <CameraHint locale={locale} onStart={() => void startCamera()} />}

        {/* Always in the page, so the stream has somewhere to go the moment the browser grants it. */}
        <div className={live ? "flex flex-col gap-3" : "hidden"}>
          <div className="relative aspect-square w-full overflow-hidden rounded-sheet bg-ink">
            <video ref={videoRef} muted playsInline aria-hidden className="size-full object-cover" />
            {/* The framing square; the dim outside is a large shadow, so the square itself stays clear. */}
            <div aria-hidden className="absolute inset-[15%] rounded-tile border-4 border-white shadow-[0_0_0_100vmax_rgba(21,23,28,0.45)]" />
          </div>
          <p role="status" className="text-xl">
            {state === "starting" ? pt("camStarting", locale) : pt("scanPoint", locale)}
          </p>
          {foreign && live && (
            <p role="alert" className="rounded-tile bg-staff-tint px-4 py-3 text-xl font-semibold text-staff-ink">
              {pt("scanForeign", locale)}
            </p>
          )}
          {torch.available && (
            <button type="button" aria-pressed={torch.on} onClick={() => void toggleTorch()} className={`${SECONDARY_SMALL} gap-2 self-start`}>
              {torch.on ? <FlashlightOff {...ICON} /> : <Flashlight {...ICON} />}
              {pt(torch.on ? "torchOff" : "torchOn", locale)}
            </button>
          )}
        </div>

        {state === "found" && (
          <p role="status" className={`${CARD} text-xl font-semibold`}>
            {pt("scanFound", locale)}
          </p>
        )}

        {state === "unavailable" && <Unavailable locale={locale} onRetry={() => void startCamera()} onOpen={open} foreign={foreign} />}
      </div>
    </main>
  );
}

/** Like the microphone hint (P1): a picture of the browser's prompt, before the browser asks. */
function CameraHint({ locale, onStart }: { locale: Locale; onStart(): void }) {
  return (
    <>
      <p className="text-xl">{pt("camHintTitle", locale)}</p>
      <div aria-hidden className={`${CARD} flex flex-col gap-3 self-center`}>
        <div className="flex items-center gap-2 text-base font-bold">
          <span className="flex size-10 items-center justify-center rounded-full bg-kibo-tint text-kibo">
            <Camera {...ICON} />
          </span>
          {pt("camPicTitle", locale)}
        </div>
        <div className="flex gap-3">
          <span className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-cream px-4 text-base text-muted">
            {pt("allowPicBlock", locale)}
          </span>
          <span className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-kibo px-4 text-base font-bold text-white outline-[3px] outline-offset-4 outline-kibo outline-dashed">
            {pt("micHintAllow", locale)}
          </span>
        </div>
      </div>
      <p className="text-xl">
        {pt("micHintPre", locale)}
        <strong>{pt("micHintAllow", locale)}</strong>
        {pt("micHintPost", locale)}
      </p>
      <button type="button" onClick={onStart} className={`${PRIMARY} min-h-22 text-2xl`}>
        <Camera size={32} strokeWidth={2} aria-hidden />
        {pt("camTurnOn", locale)}
      </button>
    </>
  );
}

/** Denied or no camera: the phone's own camera app, or the link pasted here (checked like a scanned code). */
function Unavailable(props: { locale: Locale; foreign: boolean; onRetry(): void; onOpen(text: string): boolean }) {
  const { locale } = props;
  const [link, setLink] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    props.onOpen(link);
  }
  return (
    <>
      <div role="alert" className={`${CARD} flex flex-col gap-2`}>
        <h2 className="text-xl font-bold">{pt("camUnavailable", locale)}</h2>
        <p className="text-xl">{pt("camOpenApp", locale)}</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <label htmlFor="kiosk-link" className="text-base font-semibold text-muted">
          {pt("pasteLabel", locale)}
        </label>
        <input
          id="kiosk-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={link}
          aria-invalid={props.foreign || undefined}
          aria-describedby={props.foreign ? "link-error" : undefined}
          onChange={(e) => setLink(e.target.value)}
          className={`min-h-15 w-full rounded-tile border border-field bg-white px-4 text-xl ${FOCUS}`}
        />
        {props.foreign && (
          <p id="link-error" className="text-xl text-staff-ink">
            {pt("scanForeign", locale)}
          </p>
        )}
        <button type="submit" className={PRIMARY}>
          <Link2 {...ICON} />
          {pt("pasteOpen", locale)}
        </button>
      </form>
      <button type="button" onClick={props.onRetry} className={SECONDARY}>
        <Camera {...ICON} />
        {pt("camTurnOn", locale)}
      </button>
    </>
  );
}
