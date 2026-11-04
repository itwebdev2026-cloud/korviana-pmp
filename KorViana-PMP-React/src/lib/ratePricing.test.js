import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateKorvianaPrice,
  DEFAULT_IBJA_RATES,
  DEFAULT_RATE_MARKUPS,
  hasAtMostTwoDecimals,
  RATE_DENOMINATIONS,
  rateMarkupKey,
} from "./ratePricing.js";

const pricesFor = (metal, ibjaRate) => RATE_DENOMINATIONS[metal].map(({ weightGrams }) => (
  calculateKorvianaPrice(
    metal,
    ibjaRate,
    weightGrams,
    DEFAULT_RATE_MARKUPS[rateMarkupKey(metal, weightGrams)],
  )
));

test("calculates every gold denomination using its specified markup", () => {
  assert.deepEqual(pricesFor("gold", DEFAULT_IBJA_RATES.gold), [8332, 16547, 41171, 82145, 409745, 817529]);
});

test("calculates every silver denomination using its specified markup", () => {
  assert.deepEqual(pricesFor("silver", DEFAULT_IBJA_RATES.silver), [5004, 9938, 19782, 49337, 98439]);
});

test("rounds a half-rupee upward like Excel ROUND for positive prices", () => {
  assert.equal(calculateKorvianaPrice("silver", 100000, 50, 6.25), 5313);
});

test("rejects unsupported denominations and invalid markup percentages", () => {
  assert.equal(calculateKorvianaPrice("gold", 100000, 20, 5), null);
  assert.equal(calculateKorvianaPrice("silver", 100000, 50, 100.01), null);
  assert.equal(calculateKorvianaPrice("silver", 100000, 50, 6.257), null);
  assert.equal(hasAtMostTwoDecimals(123.45), true);
  assert.equal(hasAtMostTwoDecimals(6.257), false);
});
