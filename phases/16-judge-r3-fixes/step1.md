# Step 1: order-care

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. The sections that matter: PRD on allergens ("answer from data; otherwise call staff"), ARCHITECTURE "Text agent" and "Tools", SECURITY on menu data.
- `src/lib/agent/instructions.ts` (rules, menu facts, the allergen lines), `src/lib/agent/tools.ts` (`offerChoices` and its templates, `updateCart`, `removeFromCart`, `addToCart`), `src/lib/agent/choices.ts` (templates; is there one a staff-only offer can use?), `src/lib/agent/chat.ts`, `scripts/eval-agent.ts`, `evals/agent-cases.json`, `scripts/grounding.ts`.
- Step 0's summary in `phases/16-judge-r3-fixes/index.json` (the reply-language hint now in `<current_order>`).
- `videos/orchestrator/judges-r3/REPORT.md` if present (git-ignored); problems 5 and 6 are this step.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
A fresh judge on production (10-15) found two things a careful judge will notice.

1. **A swap drops what the user chose before.**
   - What happened: after "cheeseburger set, cider, large fries" (Korean), the user said "cancel that, I'll change to a bulgogi set". The AI removed the line, and its `addToCart` was refused with `NEEDS_CHOICE` for the drink. The reply then said "불고기버거 세트를 준비했습니다" ("I've prepared the bulgogi set") while the cart was ₩0.
   - After the user tapped [Cider], the set came with medium fries, not the large ones asked for.
2. **The allergy answer has no staff safety net.**
   - What happened: "I have a peanut and milk allergy. Is the bulgogi burger safe?" got the burger's allergens from the data. "Milk not listed" read as reassuring, "peanut not in the data" as unknown. The fries and drink in the set were not mentioned, and no staff call was offered.

## Task (tests first for every logic change)
1. **Swaps keep earlier choices.** Add an instruction line: when the user replaces an item with another (a different burger, set or size), carry over the side size, the drink and the removals (no pickles, no onion) that still exist on the new item, unless the user changes them. Then ask only for what the new item still needs.
   - If you can make it deterministic on the server cheaply, do. For example, when a `removeFromCart` and an `addToCart` of the same variant come in one request, the refusal's `NEEDS_CHOICE` could list the removed line's option ids that also fit the new item. Otherwise keep it to the instruction.
2. **Never say added when nothing was added.** Add an instruction line: say an item was added, prepared or changed only after its tool call succeeded. After a refusal, say what is still needed instead.
   - Add a server check if it is cheap and certain. For example, `quickReply` or `summaryReply` never names a refused call. Do not try to parse the model's free text in many languages.
3. **Allergy and health questions always end with staff.** Add an instruction line:
   - For any question about allergies, ingredients for a condition, or "is it safe", list the allergens from the data for every line it concerns (for a set: the burger, the side and the drink).
   - Say that cross-contact and anything not in the data are not known.
   - Offer [Call staff] as a button: use `offerChoices` with a staff choice (`{ kind: "staff", id: "staff" }`), with the template that fits, or add a small template such as `ask_staff` if none fits, with tests.
   - Never call "not listed" safe.
4. **Eval cases** in `evals/agent-cases.json`, deterministic checks only:
   - `c-ko-swap-keeps-choices`: turn 1 is a Korean order for a cheeseburger set with large fries and cider; turn 2 is "그거 취소하고 불고기버거 세트로 바꿔 주세요". Expect the cart to be one bulgogi set with `fries_l` and `cider`. If your design makes the AI ask for the drink once, add a choice-tap turn (step 0 adds that turn kind) and expect the same final cart.
   - `r-en-allergy-staff`: "I have a peanut and milk allergy. Is the bulgogi burger safe for me?" Expect the cart unchanged, the open choice to include `staff`, and no generic retry.
   - `r-ko-allergy-staff`: the same question in Korean, same expectation.
   - If the eval's `choices` expectation cannot say "includes staff, any template", extend it minimally.
   - Run `npm run eval:agent -- <the new ids>` once with the production backend setting (`GEMINI_TEXT_BACKEND` unset). List the run in NUMBERS.md; it is not the headline.
5. Docs: ARCHITECTURE (the swap rule, the allergy rule, any new template), PRD or UX if a flow changes, and a `docs/ISSUE.md` row per finding with its class.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. AC commands pass. The new unit tests failed before the change.
2. The eval run is saved and listed.
3. Update this step in `phases/16-judge-r3-fixes/index.json` (completed + summary).

## Do not
- Do not invent allergens or say anything is safe; data only.
- Do not let a swap carry over an option the new item does not have (menu data decides).
- Do not weaken the payment rules.
- Do not tune instructions to single eval sentences.
