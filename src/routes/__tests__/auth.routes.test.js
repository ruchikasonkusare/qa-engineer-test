
import { test } from 'node:test';
import assert from 'node:assert/strict';

function validateEmail(email) {
  if (typeof email !== 'string' || email.trim() === '') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

test('accepts a valid email', () => {
  assert.equal(validateEmail('user@example.com'), true);
});

test('rejects email without TLD', () => {
  assert.equal(validateEmail('user@domain'), false);
});

test('rejects email without @', () => {
  assert.equal(validateEmail('userdomain.com'), false);
});

test('rejects empty email', () => {
  assert.equal(validateEmail(''), false);
});

test('rejects email containing spaces', () => {
  assert.equal(validateEmail('user name@example.com'), false);
});

test('rejects email without domain', () => {
  assert.equal(validateEmail('user@'), false);
});

test('rejects email without username', () => {
  assert.equal(validateEmail('@example.com'), false);
});

test('rejects email without a dot in domain', () => {
  assert.equal(validateEmail('user@example'), false);
});

test('accepts email with a subdomain', () => {
  assert.equal(validateEmail('user@mail.example.com'), true);
});

test('rejects a non-string email', () => {
  assert.equal(validateEmail(null), false);
});