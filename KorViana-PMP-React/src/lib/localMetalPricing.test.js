import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IBJA_RATES,
  DEFAULT_RATE_MARKUPS,
  RATE_DENOMINATIONS,
  rateMarkupKey,
} from "./ratePricing.js";
import {
  readLocalMetalPricing,
  saveLocalMetalPricing,
} from "./localMetalPricing.js";

const withMemoryStorage = (run) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });

  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
};

test("uses calculation defaults until browser-local rates are saved", () => {
  withMemoryStorage(() => {
    const pricing = readLocalMetalPricing();
    assert.deepEqual(pricing.rates, DEFAULT_IBJA_RATES);
    assert.deepEqual(pricing.markups, DEFAULT_RATE_MARKUPS);
    assert.equal(pricing.updatedAt, null);
    assert.deepEqual(pricing.history, []);
  });
});

test("saves local rates, markups, and denomination calculation history", () => {
  withMemoryStorage(() => {
    const rates = { gold: 80000, silver: 95000 };
    const saved = saveLocalMetalPricing({ rates, markups: DEFAULT_RATE_MARKUPS });
    const expectedEntryCount = Object.values(RATE_DENOMINATIONS)
      .reduce((count, denominations) => count + denominations.length, 0);

    assert.deepEqual(readLocalMetalPricing().rates, rates);
    assert.equal(saved.history.length, expectedEntryCount);
    assert.equal(saved.history[0].markup_percent, DEFAULT_RATE_MARKUPS[rateMarkupKey("gold", 1)]);
    assert.equal(saved.history[0].final_rate, 8500);
    assert.equal(saved.updatedAt, saved.history[0].recorded_at);
  });
});

test("rejects rates that cannot be represented to two decimal places", () => {
  withMemoryStorage(() => {
    assert.throws(
      () => saveLocalMetalPricing({
        rates: { gold: 80000.123, silver: 95000 },
        markups: DEFAULT_RATE_MARKUPS,
      }),
      /Unable to calculate the gold 1g rate/,
    );
  });
});
