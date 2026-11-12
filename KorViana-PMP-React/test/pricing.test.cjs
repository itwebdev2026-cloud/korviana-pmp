const assert = require('node:assert/strict');
const test = require('node:test');
const { PricingService, DEFAULT_MARKUPS, DEFAULT_RATES } = require('../dist/pricing/pricing.service.js');
const { validateSync } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const { LoginDto } = require('../dist/auth/auth.dto.js');
const { UpdatePricingDto } = require('../dist/pricing/pricing.dto.js');

test('calculates all published gold prices from the starter rates', () => {
  const prices = [1, 2, 5, 10, 50, 100].map((weight) =>
    PricingService.calculatePrice('gold', DEFAULT_RATES.gold, weight, DEFAULT_MARKUPS.gold[String(weight)]));
  assert.deepEqual(prices, [8332, 16547, 41171, 82145, 409745, 817529]);
});

test('calculates all published silver prices from the starter rates', () => {
  const prices = [50, 100, 200, 500, 1000].map((weight) =>
    PricingService.calculatePrice('silver', DEFAULT_RATES.silver, weight, DEFAULT_MARKUPS.silver[String(weight)]));
  assert.deepEqual(prices, [5004, 9938, 19782, 49337, 98439]);
});

test('rounds a half-rupee upward for positive product prices', () => {
  assert.equal(PricingService.calculatePrice('silver', 100000, 50, 6.25), 5313);
});

test('allows CSRF fields in validated form submissions', () => {
  const login = plainToInstance(LoginDto, {
    _csrf: 'csrf-token',
    email: 'customer@example.com',
    password: 'a-secure-password',
  });
  assert.deepEqual(validateSync(login), []);

  const pricing = plainToInstance(UpdatePricingDto, {
    _csrf: 'csrf-token',
    goldRate: 78420,
    silverRate: 94200,
    goldMarkup1: 6.25,
    goldMarkup2: 5.5,
    goldMarkup5: 5,
    goldMarkup10: 4.75,
    goldMarkup50: 4.5,
    goldMarkup100: 4.25,
    silverMarkup50: 6.25,
    silverMarkup100: 5.5,
    silverMarkup200: 5,
    silverMarkup500: 4.75,
    silverMarkup1000: 4.5,
  });
  assert.deepEqual(validateSync(pricing), []);
});
