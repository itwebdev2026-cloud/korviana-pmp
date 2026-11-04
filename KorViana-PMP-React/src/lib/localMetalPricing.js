import {
  calculateKorvianaPrice,
  DEFAULT_IBJA_RATES,
  DEFAULT_RATE_MARKUPS,
  hasAtMostTwoDecimals,
  RATE_DENOMINATIONS,
  RATE_UNITS,
  rateMarkupKey,
} from "./ratePricing.js";

const STORAGE_KEY = "korviana-metal-pricing";
const UPDATED_EVENT = "korviana-metal-pricing-updated";
const MAX_HISTORY_ENTRIES = 1000;

const defaults = () => ({
  rates: { ...DEFAULT_IBJA_RATES },
  markups: { ...DEFAULT_RATE_MARKUPS },
  updatedAt: null,
  history: [],
});

const getStorage = () => {
  if (!globalThis.localStorage) {
    throw new Error("Browser storage is unavailable. Enable local storage to use pricing settings.");
  }
  return globalThis.localStorage;
};

const validatePricing = (pricing) => {
  if (!pricing || typeof pricing !== "object" || !pricing.rates || !pricing.markups) {
    throw new Error("Saved pricing data is incomplete. Update the rates in the admin pricing screen.");
  }

  for (const metal of Object.keys(RATE_DENOMINATIONS)) {
    const rate = Number(pricing.rates[metal]);
    if (!Number.isFinite(rate) || rate <= 0 || !hasAtMostTwoDecimals(rate)) {
      throw new Error(`Saved ${metal} IBJA rate is invalid. Update the rates in the admin pricing screen.`);
    }

    for (const { weightGrams } of RATE_DENOMINATIONS[metal]) {
      const markup = Number(pricing.markups[rateMarkupKey(metal, weightGrams)]);
      if (!Number.isFinite(markup) || markup < 0 || markup > 100 || !hasAtMostTwoDecimals(markup)) {
        throw new Error(`Saved ${metal} markup settings are invalid. Update the rates in the admin pricing screen.`);
      }
    }
  }

  if (
    pricing.updatedAt !== null
    && (typeof pricing.updatedAt !== "string" || !Number.isFinite(Date.parse(pricing.updatedAt)))
  ) {
    throw new Error("Saved pricing update time is invalid. Update the rates in the admin pricing screen.");
  }
  if (!Array.isArray(pricing.history)) {
    throw new Error("Saved pricing history is invalid. Update the rates in the admin pricing screen.");
  }
};

export const readLocalMetalPricing = () => {
  const saved = getStorage().getItem(STORAGE_KEY);
  if (saved === null) return defaults();

  let pricing;
  try {
    pricing = JSON.parse(saved);
  } catch {
    throw new Error("Saved pricing data could not be read. Clear the browser's saved pricing and try again.");
  }
  validatePricing(pricing);
  return pricing;
};

export const getLocalMetalPricingState = () => {
  try {
    return { pricing: readLocalMetalPricing(), error: "" };
  } catch (error) {
    return {
      pricing: null,
      error: error instanceof Error ? error.message : "Local pricing could not be loaded.",
    };
  }
};

export const saveLocalMetalPricing = ({ rates, markups }) => {
  const previous = readLocalMetalPricing();
  const savedRates = Object.fromEntries(
    Object.keys(RATE_DENOMINATIONS).map((metal) => [metal, Number(rates[metal])]),
  );
  const savedMarkups = Object.fromEntries(
    Object.entries(RATE_DENOMINATIONS).flatMap(([metal, denominations]) =>
      denominations.map(({ weightGrams }) => [
        rateMarkupKey(metal, weightGrams),
        Number(markups[rateMarkupKey(metal, weightGrams)]),
      ]),
    ),
  );
  const updatedAt = new Date().toISOString();
  const newHistory = Object.entries(RATE_DENOMINATIONS).flatMap(([metal, denominations]) =>
    denominations.map(({ weightGrams }) => {
      const baseUnitGrams = RATE_UNITS[metal].baseUnitGrams;
      const markupPercent = savedMarkups[rateMarkupKey(metal, weightGrams)];
      const rawRate = (savedRates[metal] / baseUnitGrams) * weightGrams;
      const finalRate = calculateKorvianaPrice(
        metal,
        savedRates[metal],
        weightGrams,
        markupPercent,
      );
      if (finalRate === null) {
        throw new Error(`Unable to calculate the ${metal} ${weightGrams}g rate.`);
      }
      return {
        id: `${updatedAt}-${metal}-${weightGrams}`,
        metal,
        weight_grams: weightGrams,
        ibja_rate: savedRates[metal],
        base_unit_grams: baseUnitGrams,
        markup_percent: markupPercent,
        raw_rate: rawRate,
        final_rate: finalRate,
        recorded_at: updatedAt,
      };
    }),
  );
  const pricing = {
    rates: savedRates,
    markups: savedMarkups,
    updatedAt,
    history: [...newHistory, ...previous.history].slice(0, MAX_HISTORY_ENTRIES),
  };
  validatePricing(pricing);
  getStorage().setItem(STORAGE_KEY, JSON.stringify(pricing));

  if (globalThis.window && typeof globalThis.CustomEvent === "function") {
    globalThis.window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }
  return pricing;
};

export const subscribeToLocalMetalPricing = (onUpdate, onError) => {
  if (!globalThis.window) return () => {};

  const refresh = () => {
    try {
      onUpdate(readLocalMetalPricing());
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Local pricing could not be loaded."));
    }
  };
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY || event.key === null) refresh();
  };

  globalThis.window.addEventListener(UPDATED_EVENT, refresh);
  globalThis.window.addEventListener("storage", onStorage);
  return () => {
    globalThis.window.removeEventListener(UPDATED_EVENT, refresh);
    globalThis.window.removeEventListener("storage", onStorage);
  };
};
