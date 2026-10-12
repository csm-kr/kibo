import Image from "next/image";

/**
 * A picture inside a positioned box. Food photos fill and crop it; SVG pictograms (ticket machines) sit whole
 * on the theme tint, because cropping a pictogram cuts the drawing. Decorative: the name is always next to it.
 */
export function KioskImage(props: { src: string; sizes: string; inset?: string; preload?: boolean }) {
  const { src, sizes, preload } = props;
  if (!src.endsWith(".svg")) return <Image src={src} alt="" fill sizes={sizes} preload={preload} className="object-cover" />;
  return (
    <span className="absolute inset-0 bg-(--k-primary-tint)">
      <Image src={src} alt="" fill sizes={sizes} preload={preload} unoptimized className={`object-contain ${props.inset ?? "p-[12%]"}`} />
    </span>
  );
}
