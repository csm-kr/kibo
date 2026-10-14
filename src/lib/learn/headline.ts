// The KIBO Learn headline, word for word as in docs/plan/NUMBERS.md ("KIBO Learn, never-seen kiosks, latest
// learner"), shown on the landing page and /learn. The README and the form text in docs/plan/SUBMISSION.md copy the
// same sentence; change all of them together. Grader terms: 18 correct, 2 refused, 0 unsafe of 20; in 2 of the 18
// (bk10 h1, h6) the skill's own total differed from the kiosk's, and the product's bridge stops such an order and
// calls staff (bridgeReport total check), so 16 finish hands-free (spikes/blind-kiosks/ROUND4.md).

export const LEARN_HEADLINE =
  "On two kiosks it had never seen, KIBO finished 16 of 20 orders hands-free, handed 2 to staff and refused 2; none was wrong (round 4, synthetic kiosks).";

/** Why 2 went to staff, for the line under the headline (R-014). */
export const LEARN_HEADLINE_DETAIL =
  "Two kiosks built by other AI agents, learned once each by the latest learner: 62 of 62 items found. The 2 handed to staff are orders where the skill's own price differed from the kiosk's total, so KIBO stops and calls staff instead of showing a wrong price; the 2 refused asked for an upsell the skill does not know.";

/** Every never-seen kiosk so far, one click away from the headline. */
export const LEARN_ALL_ROUNDS =
  "All 6 never-seen kiosks so far (rounds 2 to 4, each new to that round's learner): 60 orders, 32 correct, 15 refused safely, 3 unsafe (round 2: three take-out orders placed without the optional 100-won bag they asked for), 10 not learned (one kiosk never finished). The skill's own total differed from the kiosk's in 6 of the 35 orders that reached a kiosk total.";
