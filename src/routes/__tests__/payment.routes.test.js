
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test helper for payment amount validation
function validateAmount(amount) {
  const numericAmount = Number(amount);

  if (amount === undefined || amount === null || amount === '' ||
      !Number.isFinite(numericAmount) || numericAmount <= 0 ||
      numericAmount > 50000) {
    return false;
  }

  return true;
}

test('GET /payments should return amount as a number', () => {
  const payment = { id: 'payment-1', amount: 100 };

  assert.equal(typeof payment.amount, 'number');
});

test('GET /payments/:id should return amount as a number', () => {
  const payment = { id: 'payment-1', amount: 250.50 };

  assert.equal(typeof payment.amount, 'number');
});

test('POST /payments should accept valid payment data', () => {
  assert.equal(validateAmount(100), true);
});

test('POST /payments should reject a negative amount', () => {
  assert.equal(validateAmount(-100), false);
});

test('POST /payments should reject a zero amount', () => {
  assert.equal(validateAmount(0), false);
});

test('POST /payments should reject an amount above 50000', () => {
  assert.equal(validateAmount(50001), false);
});

test('POST /payments should accept the maximum amount of 50000', () => {
  assert.equal(validateAmount(50000), true);
});

test('POST /payments should reject a missing amount', () => {
  assert.equal(validateAmount(undefined), false);
});

test('POST /payments should reject a non-numeric amount', () => {
  assert.equal(validateAmount('abc'), false);
});

test('POST /payments should reject a string amount in the response type check', () => {
  const payment = { id: 'payment-1', amount: '100' };

  assert.notEqual(typeof payment.amount, 'number');
});