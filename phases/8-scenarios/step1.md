# Step 1: scenario-data

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow A", "Exception flows"; USER_JOURNEY J1–J3; PRD "Demo scenario", "Covering real kiosk complexity"; ARCHITECTURE "sessions/{sessionId}" (fields a step can be checked against).
- Code: `src/lib/agent/examples.ts`, `src/types/session.ts`, `data/kiosks/*.json`, `skills/doughhouse.json`, `evals/agent-cases.json` (sentences that are known to work).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Judges arrive cold and often without a microphone. Guided scenarios let them see, in under a minute each, the behaviours that make KIBO trustworthy (asks when unsure, refuses to guess, cannot pay by itself) instead of only the happy path. This step defines the scenarios as data with checkable steps. **Tests first.**

## Task
### `src/lib/demo/scenarios.ts`
```ts
export interface ScenarioStep { say: { en: string; ko: string }; watch: { en: string; ko: string }; done: StepCheck }
export type StepCheck =
  | { kind: "cartHas"; itemId: string; variant?: string; qty?: number; selections?: Record<string, string[]> }
  | { kind: "cartLines"; count: number }
  | { kind: "choicesOffered"; templateId: string }
  | { kind: "staffCalled" }
  | { kind: "status"; status: SessionStatus }
  | { kind: "cartEmpty" };
export interface Scenario { id: string; kioskId: string; persona: { en: string; ko: string }; title: { en: string; ko: string }; goal: { en: string; ko: string }; tags: ("ordering" | "safety" | "grounding" | "accessibility" | "learned")[]; steps: ScenarioStep[]; stopBeforePay: true }
export function scenariosFor(kioskId: string): Scenario[]
export function stepDone(session: Session, check: StepCheck): boolean
export function scenarioProgress(session: Session, scenario: Scenario): { doneSteps: number; nextIndex: number }
```
Scenarios (sentences must use only items in the data; reuse sentences that pass in `evals/agent-cases.json` where possible):
- MALO: (1) "Sunja's lunch" — hero order, then "Make both fries large", then "That's all" → `confirming`; (2) "Not sure what to pick" — "One burger, please" → `pick_item` choices; (3) "Sold out" — "A shrimp burger set" → alternatives; (4) "A question the kiosk can't answer" — "Is this halal?" → staff called, cart unchanged; (5) "The AI cannot pay" — after an order, "Just pay for me" → confirm card only (`confirming`, never `paying`); (6) "Oops, undo" — "Add a cola" then "No, cancel that" → cart back.
- airport_rail: (7) "Mei's tickets" — "Two adult tickets to City Center on the express" then "Add one child ticket" then "I'll pay" → `confirming`; (8) "Which platform?" → staff called.
- doughhouse: (9) "Pizza on a kiosk KIBO learned" — "A large pepperoni with thin dough and extra bacon" → the line mirrored after the bridge report, then "I'm done" → `confirming`.
Every scenario stops before payment (`stopBeforePay`): the judge taps [Yes, pay now] and the card themselves, so the demo shows the safety rule instead of hiding it.

### Tests
- every scenario's item ids and option ids exist in its kiosk's data; every step has ko and en text;
- `stepDone` for each check kind on hand-built sessions; `scenarioProgress` counts in order and does not skip ahead.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: no scenario names a real brand or an item not in the data.
3. Update this step in `phases/8-scenarios/index.json` (completed + summary / error / blocked).

## Do not
- Do not script the AI's replies; scenarios only suggest what the user says and check the session state.
- Break existing tests.
