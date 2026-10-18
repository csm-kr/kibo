import { describe, expect, it } from "vitest";
import { DEMO_ENVIRONMENTS, offeredPlaces } from "./environments";

describe("offeredPlaces (I-426)", () => {
  it("offers only the two direct kiosks", () => {
    expect(offeredPlaces().map((e) => e.kioskId)).toEqual(["malo", "airport_rail"]);
    expect(offeredPlaces("airport_rail").map((e) => e.kioskId)).toEqual(["malo", "airport_rail"]);
  });

  it("adds a learned kiosk only while its own link selected it", () => {
    expect(offeredPlaces("bunsik").map((e) => e.kioskId)).toEqual(["malo", "airport_rail", "bunsik"]);
    expect(offeredPlaces("doughhouse").map((e) => e.kioskId)).toEqual(["malo", "airport_rail", "doughhouse"]);
  });

  it("keeps every place routable", () => {
    expect(DEMO_ENVIRONMENTS.map((e) => e.kioskId)).toEqual(["malo", "airport_rail", "doughhouse", "bunsik"]);
  });
});
