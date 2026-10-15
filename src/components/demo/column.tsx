// The /demo column cards (docs/UI_GUIDE.md "/demo frame", issue #1 batch E): white, the sheet radius and the phone's
// one soft shadow, each with a numbered caption row of one height, so the three columns start and read on one line
// (R-022): "1 Kiosk · unchanged", "2 Your phone", "3" with the scenarios and "What the AI did".

/** A column card; its width comes from the caller. */
export const COLUMN = "flex h-full min-h-0 flex-col overflow-hidden rounded-sheet bg-white text-ink shadow-card";

/** The 56px caption row over a hairline, the same height in every column (R-022). */
export const COLUMN_HEAD = "flex h-14 flex-none items-center gap-3 border-b border-line px-4";

/** The column's number: the order to look in. Not read out; the caption names the column. */
export function ColumnNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      data-column-number
      className="flex size-7 flex-none items-center justify-center rounded-full bg-kibo-tint font-display text-base font-bold text-kibo-deep"
    >
      {n}
    </span>
  );
}

/** "1 Kiosk · unchanged": the number, the name in bold and an optional note in muted. */
export function Caption({ id, n, name, note }: { id: string; n: number; name: string; note?: string }) {
  return (
    <h2 id={id} data-column-caption className="flex min-w-0 flex-none items-center gap-2 text-base font-bold">
      <ColumnNumber n={n} />
      <span>
        {name}
        {note && <span className="font-normal text-muted"> · {note}</span>}
      </span>
    </h2>
  );
}
