## Bug A: Payment Amount Returned as a String Instead of a Number

**Location:** `src/routes/payment.routes.js` (GET `/` route)
**Severity:** Medium
**Component:** Payment API

**How to Reproduce:**

1. Start the server: `npm start`.
2. Login using `POST /api/auth/login` with `{"email":"merchant@test.com","password":"Test123!"}`.
3. Copy the JWT token from the login response.
4. Send `GET /api/payments` with the JWT token in the `Authorization: Bearer <token>` header.
5. Inspect the `amount` field in the response.

**Expected Behavior:**

The `amount` field should be returned as a JSON number, for example:

```json
{
  "amount": 25.5
}
```

**Actual Behavior:**

The original implementation converts the payment amount to a string using `String(p.amount)`, causing the API to return a value such as `"25.5"` instead of `25.5`.

**Impact:**

Clients may need additional conversion before performing calculations, sorting, or displaying numeric totals. This can cause type inconsistencies between API consumers.

**Root Cause:**

The payment formatting logic explicitly converts `p.amount` to a string instead of preserving its numeric type.

**Suggested Fix:**

Remove the `String()` conversion and return the original numeric value:

```js
amount: p.amount,
```

---

## Bug B: Payment API Allows Amounts Above the Maximum Limit

**Location:** `src/routes/payment.routes.js` (POST `/` route)
**Severity:** High
**Component:** Payment API

**How to Reproduce:**

1. Start the server: `npm start`.

2. Login using `POST /api/auth/login` with `{"email":"merchant@test.com","password":"Test123!"}`.

3. Copy the JWT token from the login response.

4. Send `POST /api/payments` with the JWT token and the following JSON body:

   ```json
   {
     "amount": 60000,
     "currency": "EUR",
     "customer_email": "customer@test.com"
   }
   ```

5. Observe whether the server creates the payment or rejects the request.

**Expected Behavior:**

The API should reject payment amounts greater than the configured maximum of €50,000 with HTTP `400 Bad Request`.

**Actual Behavior:**

Before the maximum-amount validation was added, the API accepted amounts greater than €50,000, allowing unrealistic transaction values. After adding the following check, those requests are rejected:

```js
if (amount > 50000) {
  return res.status(400).json({
    error: "Amount should not be greater than 50000"
  });
}
```

**Impact:**

Without a transaction limit, users could submit unusually large payment amounts, potentially causing financial, business-rule, or downstream processing issues.

**Root Cause:**

The original payment validation checked that the amount was positive and numeric but did not enforce a maximum transaction amount.

**Suggested Fix:**

Add a maximum-amount validation before creating the payment:

```js
if (Number(amount) > 50000) {
  return res.status(400).json({
    error: "Amount should not be greater than 50000"
  });
}
```

Also validate that `amount` is a finite number before processing it, and configure the limit according to the business rules and currency.


## Bug C: Email Validation Does Not Correctly Validate the Domain Extension

**Location:** `src/routes/auth.routes.js` (email validation function)
**Severity:** Medium
**Component:** Auth API

**How to Reproduce:**

1. Start the server: `npm start`.
2. Send a `POST` request to `/api/auth/register` or another endpoint that uses `validateEmail()`.
3. Test an email address such as `user@domain`.
4. Observe whether the API accepts or rejects the email address.

**Expected Behavior:**

The validation should reject email addresses without a domain extension, such as `user@domain`, and accept common valid addresses such as `user@example.com` or `user@example.in`.

**Actual Behavior:**

The email validation regex is intended to check for a dot in the domain, but its escaping must be correct. If the regex is written incorrectly, it may fail to enforce the intended domain-extension check.

**Impact:**

Invalid email addresses may be accepted during registration or other authentication-related operations, potentially causing problems with email delivery and account verification.

**Root Cause:**

The email validation logic uses a regular expression to check the email format. The intended pattern should use `\.` to match a literal dot. In a JavaScript regex literal, writing `\\.` instead matches a backslash followed by any character, rather than a literal dot.

**Suggested Fix:**

Use the corrected regex:

```js
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
```

This rejects `user@domain` and accepts common formats such as `user@example.com` and `user@example.in`. For stricter domain-extension rules, add explicit validation or use a well-tested email validation library.


## Bug D: Webhook Signature Verification Is Not Timing-Safe

**Location:** `src/routes/webhook.routes.js` (signature verification block)
**Severity:** Critical
**Component:** Webhooks

**How to Reproduce:**

1. Start the server: `npm start`.
2. Send a `POST` request to `/api/webhooks/payment-status`.
3. Include a valid JSON body:

   ```json
   {
     "event_id": "evt_test_001",
     "payment_id": "1",
     "status": "completed"
   }
   ```
4. Generate an HMAC-SHA256 signature using the webhook secret and send it in the `x-webhook-signature` header.
5. Send another request with an invalid signature and observe the response.

**Expected Behavior:**

The server should verify the webhook signature securely, accept valid signatures, and reject invalid or missing signatures with HTTP `401 Unauthorized`.

**Actual Behavior:**

The current code compares signatures using `signature !== expectedSignature`. Although this rejects mismatched signatures, it uses ordinary string comparison rather than a timing-safe comparison.

**Impact:**

In production, non-constant-time signature comparison can potentially expose timing information that may help an attacker attempt to forge webhook signatures.

**Root Cause:**

The signature verification block in `src/routes/webhook.routes.js` uses direct string comparison instead of Node.js's `crypto.timingSafeEqual()`.

**Suggested Fix:**

Validate the signature's format and length, convert both signatures to buffers, and compare them using `crypto.timingSafeEqual()`.

---

## Bug E: Duplicate Webhooks May Be Processed More Than Once

**Location:** `src/routes/webhook.routes.js` (webhook idempotency check)
**Severity:** High
**Component:** Webhooks

**How to Reproduce:**

1. Start the server: `npm start`.
2. Send a valid `POST` request to `/api/webhooks/payment-status` with:

   ```json
   {
     "event_id": "evt_test_001",
     "payment_id": "1",
     "status": "completed"
   }
   ```
3. Send the exact same request again using the same `event_id`.
4. Observe whether the server processes the event again or returns an already-processed response.

**Expected Behavior:**

The server should process each unique webhook event only once. Repeated requests with the same `event_id` should return a successful response indicating that the event was already processed, without applying the update again.

**Actual Behavior:**

The code contains an idempotency check using `db.processed_webhooks.includes(event_id)`. However, duplicate protection can fail if `event_id` is missing or invalid, and the in-memory check-and-insert operation does not guarantee protection against simultaneous duplicate requests.

**Impact:**

Repeated webhook processing can cause incorrect payment state changes or duplicate side effects, such as repeated notifications or accounting operations, in production.

**Root Cause:**

The route relies on an in-memory array to track processed event IDs. This is not persistent across server restarts and is not an atomic check-and-insert operation.

**Suggested Fix:**

Validate that `event_id` is present and non-empty before processing. For production, store processed event IDs in a database with a unique constraint and process each event atomically.


## Bug F: Duplicate Pending Orders Allowed for the Same Table

**Location:** `src/routes/table-order.routes.js` (POST `/` route)
**Severity:** Medium
**Component:** Table Orders

**How to Reproduce:**

1. Start the server: `npm start`.
2. Send a `POST` request to `/api/table-orders` with a valid order body, for example:

   ```json
   {
     "merchant_id": "1",
     "table_number": "5",
     "items": [
       {
         "name": "Pizza",
         "quantity": 2,
         "price": 10
       }
     ]
   }
   ```
3. Send the exact same request again for table `5` while the first order is still pending.
4. Observe whether the API creates another pending order.

**Expected Behavior:**

The API should prevent multiple pending orders for the same table and merchant. A duplicate request should return HTTP `409 Conflict` and identify the existing order.

**Actual Behavior:**

The API allows another pending order to be created for the same table because it does not check whether a pending order already exists before creating a new one.

**Impact:**

Duplicate orders can cause confusion for restaurant staff, duplicate food preparation, and incorrect billing.

**Root Cause:**

The POST route does not check existing orders for the same `merchant_id` and `table_number` with a `pending` status before creating a new order.

**Suggested Fix:**

Before creating an order, check for an existing pending order:

```js
const existingOrder = (db.table_orders || []).find(
  order =>
    order.merchant_id === merchant_id &&
    String(order.table_number) === String(table_number) &&
    order.status === 'pending'
);

if (existingOrder) {
  return res.status(409).json({
    success: false,
    error: 'Table already has a pending order',
    existing_order_id: existingOrder.id
  });
}
```

---

## Bug G: Duplicate E-Invoice Submissions Allowed

**Location:** `src/routes/einvoice.routes.js` (POST `/submit` route)
**Severity:** Medium
**Component:** E-Invoice

**How to Reproduce:**

1. Start the server: `npm start`.
2. Login using `POST /api/auth/login` and obtain a valid JWT token.
3. Create or identify an invoice belonging to the authenticated merchant.
4. Send a `POST` request to `/api/einvoice/submit` with the JWT token and a valid request body:

   ```json
   {
     "invoice_id": "1",
     "customer_siret": "12345678901234"
   }
   ```
5. Submit the same invoice again with the same valid details.
6. Observe whether the API creates another submission.

**Expected Behavior:**

An invoice that has already been submitted or accepted should not be submitted again. The API should return HTTP `409 Conflict` and indicate that the invoice has already been submitted.

**Actual Behavior:**

The API can process the same invoice submission repeatedly because the duplicate-submission check is missing or commented out.

**Impact:**

Duplicate submissions can create inconsistent invoice records, duplicate external requests, and potential accounting or compliance issues.

**Root Cause:**

The `/submit` route does not enforce the invoice's existing `einvoice_status` before generating a new submission ID. The intended duplicate check is commented out:

```js
// if (invoice.einvoice_status === 'submitted' ||
//     invoice.einvoice_status === 'accepted') {
//   return res.status(409).json({
//     error: 'Invoice already submitted to tax authority'
//   });
// }
```

**Suggested Fix:**

Enable the duplicate-submission check after validating the customer SIRET and before generating a new submission ID:

```js
if (
  invoice.einvoice_status === 'submitted' ||
  invoice.einvoice_status === 'accepted'
) {
  return res.status(409).json({
    error: 'Invoice already submitted to tax authority',
    submission_id: invoice.submission_id
  });
}
```

For production, also use database-level safeguards to prevent simultaneous duplicate submissions.
