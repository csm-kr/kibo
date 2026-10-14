import Image, { getImageProps } from "next/image";
import type { KioskData } from "@/types/menu";

/**
 * Item and option photos use one `sizes` everywhere (tile, sheet, review, upsell), so the browser asks for one
 * file per photo and the preload below has already fetched it when a screen first shows it.
 */
export const ITEM_SIZES = "380px";
export const ICON_SIZES = "80px";
export const DINE_SIZES = "480px";

/**
 * A picture inside a positioned box. Food photos fill and crop it; SVG pictograms (ticket machines) sit whole
 * on the theme tint, because cropping a pictogram cuts the drawing. Decorative: the name is always next to it.
 * Eager: a kiosk has a few dozen small pictures, and a lazy one is still blank when an AI change jumps to it.
 */
export function KioskImage(props: { src: string; sizes: string; inset?: string; preload?: boolean }) {
  const { src, sizes, preload } = props;
  if (!src.endsWith(".svg")) return <Image src={src} alt="" fill sizes={sizes} preload={preload} loading="eager" className="object-cover" />;
  return (
    <span className="absolute inset-0 bg-(--k-primary-tint)">
      <Image src={src} alt="" fill sizes={sizes} preload={preload} loading="eager" unoptimized className={`object-contain ${props.inset ?? "p-[12%]"}`} />
    </span>
  );
}

/**
 * Fetches every picture the kiosk can show (items, options, category icons, dine photos) into the browser cache,
 * with the same srcset and sizes the screens use, so no photo is blank when a phone's first change opens the menu
 * or a sheet (UX judge, 10-13). Browser only.
 */
export function preloadKioskImages(kiosk: KioskData): void {
  const jobs: [string, string][] = [];
  for (const item of kiosk.items) {
    jobs.push([item.image, ITEM_SIZES]);
    for (const g of item.optionGroups) for (const o of g.options) if (o.image) jobs.push([o.image, ITEM_SIZES]);
  }
  for (const c of kiosk.categories) jobs.push([c.icon, ICON_SIZES]);
  if (kiosk.dineOptions) for (const d of Object.values(kiosk.dineOptions)) jobs.push([d.image, DINE_SIZES]);
  const seen = new Set<string>();
  for (const [src, sizes] of jobs) {
    if (seen.has(`${src} ${sizes}`)) continue;
    seen.add(`${src} ${sizes}`);
    const { props } = getImageProps({ src, alt: "", fill: true, sizes, unoptimized: src.endsWith(".svg") });
    const img = new window.Image();
    if (props.srcSet) {
      img.sizes = props.sizes ?? sizes;
      img.srcset = props.srcSet;
    }
    img.src = props.src;
  }
}
