
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { db } from '../../db/database.js';

const JWT_SECRET = 'test-secret-key-do-not-use-in-production';
const merchantId = 'qa-table-merchant';
const token = jwt.sign(
  { id: merchantId, email: 'qa-table@test.com', type: 'merchant' },
  JWT_SECRET
);

const headers = { Authorization: `Bearer ${token}` };
const existingOrderId = 'qa-existing-pending-order';
const tableNumber = 9876;

before(() => {
  db.users = db.users.filter(u => u.id !== merchantId);
  db.table_orders = (db.table_orders || []).filter(
    o => o.id !== existingOrderId && o.table_number !== tableNumber
  );

  db.users.push({
    id: merchantId,
    email: 'qa-table@test.com',
    type: 'merchant'
  });

  db.table_orders.push({
    id: existingOrderId,
    merchant_id: merchantId,
    table_number: tableNumber,
    items: [{ name: 'Test item', price: 10, quantity: 1 }],
    status: 'pending',
    total: 10
  });
});

after(() => {
  db.users = db.users.filter(u => u.id !== merchantId);
  db.table_orders = (db.table_orders || []).filter(
    o => o.merchant_id === merchantId
  );
});

test('creates a table order with valid data', async () => {
  const response = await request(app)
    .post('/api/table-orders')
    .send({
      merchant_id: merchantId,
      table_number: 9877,
      items: [{ name: 'Burger', price: 10, quantity: 2 }],
      customer_name: 'Test Customer'
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.total, 20);
  assert.equal(response.body.data.status, 'pending');
});

test('rejects an order without merchant_id', async () => {
  const response = await request(app)
    .post('/api/table-orders')
    .send({
      table_number: 123,
      items: [{ name: 'Burger', price: 10, quantity: 1 }]
    });

  assert.equal(response.status, 400);
});

test('rejects an order without items', async () => {
  const response = await request(app)
    .post('/api/table-orders')
    .send({
      merchant_id: merchantId,
      table_number: 123
    });

  assert.equal(response.status, 400);
});

test('rejects an order with an empty items array', async () => {
  const response = await request(app)
    .post('/api/table-orders')
    .send({
      merchant_id: merchantId,
      table_number: 123,
      items: []
    });

  assert.equal(response.status, 400);
});

test('rejects a duplicate pending order for the same merchant and table', async () => {
  const response = await request(app)
    .post('/api/table-orders')
    .send({
      merchant_id: merchantId,
      table_number: tableNumber,
      items: [{ name: 'Pizza', price: 15, quantity: 1 }]
    });

  assert.equal(response.status, 409);
});

test('requires authentication to list table orders', async () => {
  const response = await request(app).get('/api/table-orders');

  assert.equal(response.status, 401);
});

test('lists orders for the authenticated merchant', async () => {
  const response = await request(app)
    .get('/api/table-orders')
    .set(headers);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
  assert.ok(
    response.body.data.every(o => o.merchant_id === merchantId)
  );
});

test('rejects an invalid order status', async () => {
  const response = await request(app)
    .patch(`/api/table-orders/${existingOrderId}/status`)
    .set(headers)
    .send({ status: 'unknown-status' });

  assert.equal(response.status, 400);
});

test('updates an order status for its owner', async () => {
  const response = await request(app)
    .patch(`/api/table-orders/${existingOrderId}/status`)
    .set(headers)
    .send({ status: 'preparing' });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'preparing');
});

test('returns 404 when updating a nonexistent order', async () => {
  const response = await request(app)
    .patch('/api/table-orders/nonexistent-order/status')
    .set(headers)
    .send({ status: 'preparing' });

  assert.equal(response.status, 404);
});