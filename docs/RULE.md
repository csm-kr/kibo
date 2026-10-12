# Rules from repeated issues

When an issue class in `docs/ISSUE.md` is seen for the **3rd time**, it becomes a rule here. One slip is bad luck, three is a habit, and a habit needs a written rule and a check. These rules bind like `CLAUDE.md`. A rule added by a harness session is marked `(proposed)`; it is followed until the user accepts it (remove the mark) or rejects it. Remove or relax a rule only with the user's consent.

## How to add a rule
1. Give it the next id and one imperative line saying what to do.
2. Link the issue ids and the dates it was seen.
3. Say why in one sentence.
4. Give a check: a command, or the exact thing to look at during a QA pass.
5. Write the rule id in the `Rule` column of every linked issue row.

```markdown
### R-001: <what to do, one line>
- From: I-00x (seen 10-12/session, 10-14/1-mvp:3, 10-15/2-voice:qa)
- Why: <one sentence>
- Check: <command or concrete look>
```

## Rules

### R-001: Every number or capability claim names its evidence; anything unchecked says "unverified"
- From: `unverified-claim` — I-010, I-014, I-018 (also I-021), all seen 10-12/session
- Why: three times in one day docs stated more than the evidence showed (public judging, cited standard values, replay speed and kiosk features), and judges and the T&C punish overclaiming.
- Check: for each number, limit or "supports X" added or changed, the same sentence or table row cites a result file in the repo, an official URL, or the word "unverified". Reviewers grep the diff for numbers without one.

### R-002 (proposed): When a contract changes, update every doc that states it in the same change
- From: `contract-drift` — I-017 (seen 10-12/session), I-024 and I-025 (seen 10-12/1-core:2)
- Why: state rules, actors, fields and id formats are restated in ARCHITECTURE, ADRs, SECURITY, UX and step files, and each change left some copies stale, so build steps code against conflicting contracts.
- Check: for each command, field, state or id format a change touches, `grep -rn "<name>" docs/ phases/` and confirm every hit says the same thing as the code.
