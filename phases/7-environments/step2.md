# Step 2: airport-rail-data

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD "Users" (Mei, a tourist; older travellers), "Data principle"; UI_GUIDE "Anti-patterns" (no emoji icons; stroke SVG icons); CLAUDE.md (no real brands, logos or store screens).
- Code: `src/types/menu.ts`, `src/lib/adapters/catalog.ts` (+ tests, `allKioskIds`), `data/kiosks/malo.json` (format reference).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Add a fictional airport rail ticket machine as a direct-adapter kiosk.

### `data/kiosks/airport_rail.json` (`kioskId: "airport_rail"`, `domain: "ticket"`)
- Brand: `{ ko: "스카이라인 공항철도", en: "SKYLINE AIRPORT RAIL" }` (fictional; no real operator, line or station names; no real logos); tagline for K1 (e.g. "도심까지 가장 빠른 길" / "The fastest way downtown").
- Theme: deep navy primary with a sky-blue tint and a warm yellow accent; every text/background pair ≥ 4.5:1 (check with a small contrast function in the test). Background stays light.
- `locale: "ko"`, `locales: ["ko", "en"]`, no `dineOptions`, `vocabulary` for tickets.
- **Categories (3):** `express` (직통열차 / Express, non-stop to the city), `all_stop` (일반열차 / All-stop), `pass` (교통카드·이용권 / Cards and passes).
- **Items (10–14), fictional stations:** e.g. Express to "City Center" (adult 11,000); all-stop trains to "City Center", "Harbor Gate", "Expo Park", "Riverside", "Old Town" (fares between 1,450 and 4,750, multiples of 10); passes: "1-day pass" (15,000), "rechargeable transit card" (card 4,000 with a required `top_up` group: 0, 10,000, 20,000, 30,000 as price deltas).
- **Groups:** every train ticket has a required `passenger` group (min 1, max 1, default `adult`): `adult` +0, `teen` (13–18) and `child` (6–12) with negative deltas that keep the fare ≥ 0, `senior` (65+). Express also has an optional `seat` group (`window`, `aisle`, +0). Use `qty` for the number of tickets of the same kind ("two adults and one child" = two lines).
- `subtitle` for trains: "직통 · 43분" / "Non-stop · 43 min", "12개 역 · 59분" / "12 stops · 59 min" (fictional; these are product data, not claims about a real line).
- `kcal: null`, `allergens: []`, `badge` where sensible ("best" on the express), `soldOut` on one item (e.g. a sold-out "late-night limousine bus combo" or one pass) so the alternatives flow works; `availableHours: null` everywhere (judges test at any hour).
- `upsellRules`: none, or one sensible rule (express ticket → offer the rechargeable card) if it reads like a real machine; keep it once per order.
- Images: no photos. Make simple stroke pictograms as SVG files in `public/kiosks/airport_rail/` (train front, express train, ticket, card, pass), 24px grid scaled up, 1.5–2px stroke, theme navy on transparent; tiles use them with the name, as real ticket machines do. Category icons likewise.

### Tests
The generic catalog checks from step 1 now cover this kiosk; add specific ones: 3 categories, every train has `passenger` with default `adult`, every resolved fare ≥ 0, the transit card needs a `top_up` choice (`NEEDS_CHOICE`), "2 adult + 1 child express" resolves to the right total.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: no real operator, line, station, card or brand names; no emoji; contrast of theme pairs ≥ 4.5:1.
3. Update this step in `phases/7-environments/index.json` (completed + summary / error / blocked).

## Do not
- Do not use real airport, railway or transit card names or logos (third-party IP disqualifies the entry).
- Do not add time limits to items (`availableHours` null).
- Break existing tests.
