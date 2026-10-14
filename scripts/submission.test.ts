import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The form's solution description field takes at most 1,024 characters (docs/plan/SUBMISSION.md "Form").

const doc = readFileSync("docs/plan/SUBMISSION.md", "utf8");
const section = doc.split("## Solution description (draft)")[1] ?? "";
const text = section.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? "";
/** Code points, so a non-ASCII character counts once. */
const length = [...text].length;

describe("docs/plan/SUBMISSION.md solution description", () => {
  it("fits the form's 1,024 characters", () => {
    expect(text.length).toBeGreaterThan(0);
    expect(length).toBeLessThanOrEqual(1024);
  });

  it("states its own character count", () => {
    expect(section).toContain(`**${length.toLocaleString("en-US")} / 1,024 characters**`);
  });

  // The form asks how Firebase, Firestore, Cloud Run and Gemini are used.
  it("names Firebase, Firestore, Cloud Run and Gemini", () => {
    for (const name of ["Firebase", "Firestore", "Cloud Run", "Gemini"]) expect(text).toContain(name);
  });
});
