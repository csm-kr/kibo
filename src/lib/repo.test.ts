import { describe, expect, it } from "vitest";
import { REPO_URL, repoLink } from "./repo";

describe("repoLink", () => {
  it("links a file as a blob on main", () => {
    expect(repoLink("spikes/blind-kiosks/RESULTS.md")).toBe(`${REPO_URL}/blob/main/spikes/blind-kiosks/RESULTS.md`);
  });

  it("links a folder as a tree on main, without the trailing slash", () => {
    expect(repoLink("evals/results/")).toBe(`${REPO_URL}/tree/main/evals/results`);
  });
});
