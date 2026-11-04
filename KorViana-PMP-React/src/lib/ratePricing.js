export const RATE_DENOMINATIONS = {
  gold: [
    { weightGrams: 1, markupPercent: 6.25 },
    { weightGrams: 2, markupPercent: 5.5 },
    { weightGrams: 5, markupPercent: 5 },
    { weightGrams: 10, markupPercent: 4.75 },
    { weightGrams: 50, markupPercent: 4.5 },
    { weightGrams: 100, markupPercent: 4.25 },
  ],
  silver: [
    { weightGrams: 50, markupPercent: 6.25 },
    { weightGrams: 100, markupPercent: 5.5 },
    { weightGrams: 200, markupPercent: 5 },
    { weightGrams: 500, markupPercent: 4.75 },
    { weightGrams: 1000, markupPercent: 4.5 },
  ],
};

export const RATE_UNITS = {
  gold: { baseUnitGrams: 10, label: "10 grams" },
  silver: { baseUnitGrams: 1000, label: "1 kilogram" },
};

export const DEFAULT_IBJA_RATES = { gold: 78420, silver: 94200 };

export const rateMarkupKey = (metal, weightGrams) => `${metal}:${weightGrams}`;

export const hasAtMostTwoDecimals = (value) => {
  const scaledValue = Number(value) * 100;
  const roundedValue = Math.round(scaledValue);
  return Number.isFinite(scaledValue)
    && Number.isSafeInteger(roundedValue)
    && Math.abs(scaledValue - roundedValue) < 1e-9;
};

export const DEFAULT_RATE_MARKUPS = Object.fromEntries(
  Object.entries(RATE_DENOMINATIONS).flatMap(([metal, denominations]) =>
    denominations.map(({ weightGrams, markupPercent }) => [
      rateMarkupKey(metal, weightGrams),
      markupPercent,
    ]),
  ),
);

export function calculateKorvianaPrice(metal, ibjaRate, weightGrams, markupPercent) {
  const rateUnits = RATE_UNITS[metal];
  const isSupportedWeight = RATE_DENOMINATIONS[metal]?.some(
    (denomination) => denomination.weightGrams === weightGrams,
  );
  const rateScaled = Number(ibjaRate) * 100;
  const markupScaled = Number(markupPercent) * 100;
  const baseRateCents = Math.round(rateScaled);
  const markupHundredths = Math.round(markupScaled);

  if (
    !rateUnits
    || !isSupportedWeight
    || !hasAtMostTwoDecimals(ibjaRate)
    || !hasAtMostTwoDecimals(markupPercent)
    || !Number.isSafeInteger(baseRateCents)
    || baseRateCents < 0
    || !Number.isSafeInteger(markupHundredths)
    || markupHundredths < 0
    || markupHundredths > 10000
  ) {
    return null;
  }

  const numerator = BigInt(baseRateCents)
    * BigInt(weightGrams)
    * (10000n + BigInt(markupHundredths));
  const denominator = BigInt(rateUnits.baseUnitGrams) * 1000000n;

  return Number((numerator + denominator / 2n) / denominator);
}
