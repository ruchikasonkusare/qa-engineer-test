
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import app from '../../server.js';
import { db } from '../../db/database.js';

const SECRET = 'test-webhook-secret-key';

function signPayload(payload) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

const paymentId = 'qa-webhook-payment';
const eventId = 'qa-webhook-event';

before(() => {
  db.payments = db.payments.filter(p => p.id !== paymentId);
  db.processed_webhooks = db.processed_webhooks.filter(
    id => id !== eventId
  );

  db.payments.push({
    id: paymentId,
    merchant_id: '1',
    amount: 100,
    currency: 'EUR',
    status: 'pending'
  });
});

after(() => {
  db.payments = db.payments.filter(p => p.id !== paymentId);
  db.processed_webhooks = db.processed_webhooks.filter(
    id => id !== eventId
  );
});

test('rejects a webhook without a signature', async () => {
  const payload = {
    payment_id: paymentId,
    status: 'completed',
    event_id: 'missing-signature-event'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .send(payload);

  assert.ok(
    response.status === 400 || response.status === 401,
    `Expected rejection, received ${response.status}`
  );
});

test('rejects a webhook with an invalid signature', async () => {
  const payload = {
    payment_id: paymentId,
    status: 'completed',
    event_id: 'invalid-signature-event'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', 'invalid-signature')
    .send(payload);

  assert.ok(
    response.status === 400 || response.status === 401,
    `Expected rejection, received ${response.status}`
  );
});

test('rejects a webhook missing payment_id', async () => {
  const payload = {
    status: 'completed',
    event_id: 'missing-payment-id'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signPayload(payload))
    .send(payload);

  assert.equal(response.status, 400);
});

test('rejects a webhook missing event_id', async () => {
  const payload = {
    payment_id: paymentId,
    status: 'completed'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signPayload(payload))
    .send(payload);

  assert.equal(response.status, 400);
});

test('returns 404 when the payment does not exist', async () => {
  const payload = {
    payment_id: 'unknown-payment',
    status: 'completed',
    event_id: 'unknown-payment-event'
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signPayload(payload))
    .send(payload);

  assert.equal(response.status, 404);
});

test('processes a correctly signed webhook', async () => {
  const payload = {
    payment_id: paymentId,
    status: 'completed',
    event_id: eventId
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signPayload(payload))
    .send(payload);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.new_status, 'completed');
  assert.equal(
    db.payments.find(p => p.id === paymentId).status,
    'completed'
  );
});

test('does not process the same webhook event twice', async () => {
  const payload = {
    payment_id: paymentId,
    status: 'completed',
    event_id: eventId
  };

  const response = await request(app)
    .post('/api/webhooks/payment-status')
    .set('x-webhook-signature', signPayload(payload))
    .send(payload);

  assert.equal(response.status, 200);
  assert.equal(response.body.message, 'Already processed');
});