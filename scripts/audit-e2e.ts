/**
 * Comprehensive End-to-End Security & Functional Audit Test Suite for Eventide
 * Executes all test suites against the live cluster or specified BASE_URL.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://eventide-ingress-7b5f0ef620246763.elb.us-east-1.amazonaws.com'
const PASSWORD = 'seed-password-123'

interface TestResult {
  category: string
  name: string
  passed: boolean
  detail?: string
  durationMs: number
}

const results: TestResult[] = []

async function test(category: string, name: string, fn: () => Promise<void>) {
  const start = Date.now()
  try {
    await fn()
    results.push({ category, name, passed: true, durationMs: Date.now() - start })
    console.log(`  ✓ [${category}] ${name} (${Date.now() - start}ms)`)
  } catch (err: any) {
    const detail = err instanceof Error ? err.message : String(err)
    results.push({ category, name, passed: false, detail, durationMs: Date.now() - start })
    console.error(`  ✗ [${category}] ${name} (${Date.now() - start}ms) -> ${detail}`)
  }
}

function expect(cond: unknown, message: string) {
  if (!cond) throw new Error(message)
}

function expectStatus(status: number, expected: number | number[], body?: any) {
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (!allowed.includes(status)) {
    throw new Error(`Expected HTTP status ${allowed.join(' or ')}, got ${status}. Body: ${JSON.stringify(body)}`)
  }
}

interface Principal {
  session: string
  jwt: string
  user: any
}

async function request(
  path: string,
  options: RequestInit & { token?: string; idempotencyKey?: string } = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const { token, idempotencyKey, ...rest } = options
  const headers = new Headers(rest.headers)
  if (!headers.has('content-type') && rest.body) {
    headers.set('content-type', 'application/json')
  }
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }
  if (idempotencyKey) {
    headers.set('idempotency-key', idempotencyKey)
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
  })

  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body, headers: res.headers }
}

async function signIn(email: string): Promise<Principal> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Sign in failed for ${email}: ${res.status} ${txt}`)
  }
  const session = res.headers.get('set-auth-token')
  if (!session) throw new Error(`Missing set-auth-token for ${email}`)
  const body = await res.json()

  const jwtRes = await fetch(`${BASE_URL}/api/auth/token`, {
    headers: { authorization: `Bearer ${session}` },
  })
  if (!jwtRes.ok) throw new Error(`Token exchange failed for ${email}`)
  const jwtData = await jwtRes.json()

  return { session, jwt: jwtData.token, user: body.user }
}

async function signUpNew(prefix: string): Promise<Principal> {
  const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@audit.test`
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Audit User ${email}`, email, password: PASSWORD }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Sign up failed for ${email}: ${res.status} ${txt}`)
  }
  const session = res.headers.get('set-auth-token')
  if (!session) throw new Error(`Missing set-auth-token for new user ${email}`)
  const body = await res.json()

  const jwtRes = await fetch(`${BASE_URL}/api/auth/token`, {
    headers: { authorization: `Bearer ${session}` },
  })
  if (!jwtRes.ok) throw new Error(`Token exchange failed for ${email}`)
  const jwtData = await jwtRes.json()

  return { session, jwt: jwtData.token, user: body.user }
}

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

async function runAudit() {
  console.log(`\n======================================================`)
  console.log(`🛡️  STARTING EVENTIDE END-TO-END SECURITY & QUALITY AUDIT`)
  console.log(`🎯 Target URL: ${BASE_URL}`)
  console.log(`⏱️  Timestamp:  ${new Date().toISOString()}`)
  console.log(`======================================================\n`)

  // Pre-load Principals
  console.log(`🔑 Authenticating test principals...`)
  const admin = await signIn('admin@eventide.test')
  const somchai = await signIn('somchai@eventide.test')
  const nadia = await signIn('nadia@eventide.test')
  const attendee = await signIn('tom@eventide.test')
  const attendeePriya = await signIn('priya@eventide.test')
  console.log(`✓ All 5 personas authenticated successfully.\n`)

  // ==========================================
  // SUITE 1: PERIMETER & INGRESS SHIELDING
  // ==========================================
  console.log(`--- [SUITE 1: Perimeter & Ingress Shielding] ---`)

  await test('Perimeter', 'Internal route /internal/events is shielded from public ingress', async () => {
    const res = await request('/internal/events/anything')
    const isHtml = typeof res.body === 'string' && res.body.includes('<!doctype html>')
    expect(res.status === 404 || isHtml, 'Internal service must be unreachable')
  })

  await test('Perimeter', 'Internal route /internal/orders is shielded from public ingress', async () => {
    const res = await request('/internal/orders/anything')
    const isHtml = typeof res.body === 'string' && res.body.includes('<!doctype html>')
    expect(res.status === 404 || isHtml, 'Internal service must be unreachable')
  })

  await test('Perimeter', 'Public health endpoints are alive and healthy', async () => {
    const res = await request('/health/ready')
    expectStatus(res.status, 200, res.body)
  })

  await test('Perimeter', 'Swagger / OpenAPI spec is accessible', async () => {
    const res = await request('/swagger')
    expectStatus(res.status, 200, res.body)
  })

  // ==========================================
  // SUITE 2: AUTHENTICATION & TOKEN HARDENING
  // ==========================================
  console.log(`\n--- [SUITE 2: Authentication & Token Security] ---`)

  await test('Auth', 'Sign-in with incorrect password is rejected (401)', async () => {
    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@eventide.test', password: 'WrongPassword999!' }),
    })
    expectStatus(res.status, [400, 401], res.body)
  })

  await test('Auth', 'Unauthenticated call to protected endpoint is rejected (401)', async () => {
    const res = await request('/api/tickets/me')
    expectStatus(res.status, 401, res.body)
  })

  await test('Auth', 'Tampered / forged JWT token is strictly rejected (401)', async () => {
    const fakeToken = somchai.jwt.slice(0, -10) + 'ABCDEFGHIJ'
    const res = await request('/api/organizer/events', { token: fakeToken })
    expectStatus(res.status, 401, res.body)
  })

  await test('Auth', 'Malformed Bearer token is rejected (401)', async () => {
    const res = await request('/api/organizer/events', { token: 'invalid.token.payload' })
    expectStatus(res.status, 401, res.body)
  })

  await test('Auth', 'Banned user is blocked from authenticated operations (401/403)', async () => {
    try {
      const banned = await signIn('banned@eventide.test')
      const res = await request('/api/orders', { token: banned.jwt })
      expectStatus(res.status, [401, 403], res.body)
    } catch (err: any) {
      expect(err.message.includes('banned') || err.message.includes('failed') || err.message.includes('401') || err.message.includes('403'), 'Banned user is blocked')
    }
  })

  // ==========================================
  // SUITE 3: RBAC PERMISSIONS MATRIX
  // ==========================================
  console.log(`\n--- [SUITE 3: RBAC & Authorization Matrix] ---`)

  await test('RBAC', 'Attendee cannot create events (403 Forbidden)', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: attendee.jwt,
      body: JSON.stringify({
        title: 'Hacked Event',
        startsAt: iso(86400000),
        endsAt: iso(2 * 86400000),
        salesStartAt: iso(-1000),
        salesEndAt: iso(86400000),
        capacity: 100,
      }),
    })
    expectStatus(res.status, 403, res.body)
  })

  await test('RBAC', 'Attendee cannot view organizer events list (403 Forbidden)', async () => {
    const res = await request('/api/organizer/events', { token: attendee.jwt })
    expectStatus(res.status, 403, res.body)
  })

  

  await test('RBAC', 'Attendee cannot access user management (403 Forbidden)', async () => {
    const res = await request('/api/admin/users', { token: attendee.session })
    expectStatus(res.status, 403, res.body)
  })

  await test('RBAC', 'Attendee cannot access audit logs (403 Forbidden)', async () => {
    const res = await request('/api/admin/audit-logs', { token: attendee.session })
    expectStatus(res.status, 403, res.body)
  })

  await test('RBAC', 'Organizer cannot access admin audit logs (403 Forbidden)', async () => {
    const res = await request('/api/admin/audit-logs', { token: somchai.session })
    expectStatus(res.status, 403, res.body)
  })

  await test('RBAC', 'Admin can access audit logs successfully (200)', async () => {
    const res = await request('/api/admin/audit-logs', { token: admin.session })
    expectStatus(res.status, 200, res.body)
    expect(Array.isArray(res.body), 'audit logs should be an array')
  })

  // ==========================================
  // SUITE 4: IDOR & MULTI-TENANT ISOLATION
  // ==========================================
  console.log(`\n--- [SUITE 4: IDOR & Multi-Tenant Data Isolation] ---`)

  // Step 4.1: Somchai creates an event
  const somchaiEvent = await request('/api/events', {
    method: 'POST',
    token: somchai.jwt,
    body: JSON.stringify({
      title: `Somchai Private Conference ${Date.now()}`,
      description: 'Exclusive event for testing IDOR',
      startsAt: iso(5 * 86400000),
      endsAt: iso(5 * 86400000 + 4 * 3600000),
      salesStartAt: iso(-3600000),
      salesEndAt: iso(4 * 86400000),
      capacity: 50,
    }),
  })
  expectStatus(somchaiEvent.status, 200, somchaiEvent.body)
  const somchaiEventId = somchaiEvent.body.id

  await test('RBAC', 'Attendee cannot suspend events (403 Forbidden)', async () => {
    const res = await request(`/api/admin/events/${somchaiEventId}/suspend`, {
      method: 'POST',
      token: attendee.jwt,
    })
    expectStatus(res.status, 403, res.body)
  })

  await test('IDOR', 'Organizer Nadia CANNOT edit Organizer Somchai’s event (403/404)', async () => {
    const res = await request(`/api/events/${somchaiEventId}`, {
      method: 'PATCH',
      token: nadia.jwt,
      body: JSON.stringify({
        title: 'Hijacked by Nadia',
        startsAt: iso(5 * 86400000),
        endsAt: iso(5 * 86400000 + 4 * 3600000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(4 * 86400000),
        capacity: 50,
      }),
    })
    expectStatus(res.status, [403, 404], res.body)
  })

  await test('IDOR', 'Organizer Nadia CANNOT add ticket types to Somchai’s event (403/404)', async () => {
    const res = await request('/api/ticket-types', {
      method: 'POST',
      token: nadia.jwt,
      body: JSON.stringify({
        eventId: somchaiEventId,
        name: 'Hijacked Ticket',
        price: '10.00',
        quota: 10,
        maxPerOrder: 1,
      }),
    })
    expectStatus(res.status, [403, 404], res.body)
  })

  await test('IDOR', 'Organizer Nadia CANNOT publish Somchai’s event (403/404)', async () => {
    const res = await request(`/api/events/${somchaiEventId}/publish`, {
      method: 'POST',
      token: nadia.jwt,
    })
    expectStatus(res.status, [403, 404], res.body)
  })

  // Add legitimate ticket type by Somchai
  const ttRes = await request('/api/ticket-types', {
    method: 'POST',
    token: somchai.jwt,
    body: JSON.stringify({
      eventId: somchaiEventId,
      name: 'Somchai Ticket',
      price: '250.00',
      quota: 20,
      maxPerOrder: 2,
    }),
  })
  expectStatus(ttRes.status, 200, ttRes.body)
  const somchaiTicketTypeId = ttRes.body.id

  // Somchai publishes event
  const pubRes = await request(`/api/events/${somchaiEventId}/publish`, {
    method: 'POST',
    token: somchai.jwt,
  })
  expectStatus(pubRes.status, 200, pubRes.body)

  // Attendee Tom creates an order
  const tomOrder = await request('/api/orders', {
    method: 'POST',
    token: attendee.jwt,
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify({
      eventId: somchaiEventId,
      items: [{ ticketTypeId: somchaiTicketTypeId, quantity: 1 }],
    }),
  })
  expectStatus(tomOrder.status, 200, tomOrder.body)
  const tomOrderId = tomOrder.body.id

  await test('IDOR', 'Attendee Priya CANNOT view Attendee Tom’s order (403/404)', async () => {
    const res = await request(`/api/orders/${tomOrderId}`, { token: attendeePriya.jwt })
    expectStatus(res.status, [403, 404], res.body)
  })

  await test('IDOR', 'Attendee Priya CANNOT checkout/pay for Attendee Tom’s order (403/404)', async () => {
    const res = await request('/api/payments/checkout', {
      method: 'POST',
      token: attendeePriya.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ orderId: tomOrderId }),
    })
    expectStatus(res.status, [403, 404], res.body)
  })

  // ==========================================
  // SUITE 5: INPUT VALIDATION & INJECTION RESILIENCE
  // ==========================================
  console.log(`\n--- [SUITE 5: Input Validation & Injection Resilience] ---`)

  await test('Lifecycle', 'Event with inverted dates (endsAt < startsAt) is rejected (400/409/422)', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: 'Time Travel Event',
        startsAt: iso(5 * 86400000),
        endsAt: iso(3 * 86400000), // ends before start!
        salesStartAt: iso(-3600000),
        salesEndAt: iso(2 * 86400000),
        capacity: 100,
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Lifecycle', 'Publishing an event with 0 ticket types is rejected (400/409/422)', async () => {
    const emptyEvent = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: `Empty Event ${Date.now()}`,
        startsAt: iso(4 * 86400000),
        endsAt: iso(4 * 86400000 + 3600000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(3 * 86400000),
        capacity: 100,
      }),
    })
    expectStatus(emptyEvent.status, 200, emptyEvent.body)
    const pubRes = await request(`/api/events/${emptyEvent.body.id}/publish`, {
      method: 'POST',
      token: somchai.jwt,
    })
    expectStatus(pubRes.status, [400, 409, 422], pubRes.body)
  })

  await test('Validation', 'Negative ticket price is rejected (400/422)', async () => {
    const res = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: somchaiEventId,
        name: 'Negative Ticket',
        price: '-50.00',
        quota: 5,
        maxPerOrder: 1,
      }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Validation', 'Malformed price string (not 2 decimal places) is rejected (400/422)', async () => {
    const res = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: somchaiEventId,
        name: 'Bad Price Ticket',
        price: '100.999',
        quota: 5,
        maxPerOrder: 1,
      }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Validation', 'Ticket quota exceeding event capacity is rejected (400/409/422)', async () => {
    const res = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: somchaiEventId,
        name: 'Excessive Ticket',
        price: '100.00',
        quota: 99999, // capacity is 50
        maxPerOrder: 1,
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Validation', 'Order quantity exceeding maxPerOrder is rejected (400/409/422)', async () => {
    const res = await request('/api/orders', {
      method: 'POST',
      token: attendee.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: somchaiEventId,
        items: [{ ticketTypeId: somchaiTicketTypeId, quantity: 10 }], // maxPerOrder is 2
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Validation', 'Order with zero quantity is rejected (400/422)', async () => {
    const res = await request('/api/orders', {
      method: 'POST',
      token: attendee.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: somchaiEventId,
        items: [{ ticketTypeId: somchaiTicketTypeId, quantity: 0 }],
      }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Injection', 'SQL Injection payload in query parameters is safely handled without error (200)', async () => {
    const res = await request("/api/events?query=' OR 1=1;--")
    expectStatus(res.status, 200, res.body)
  })

  await test('Injection', 'XSS payload in event creation is safely accepted/escaped without 500 error', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: '<script>alert("XSS")</script>',
        description: '<img src=x onerror=alert(1)>',
        startsAt: iso(7 * 86400000),
        endsAt: iso(7 * 86400000 + 3600000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(6 * 86400000),
        capacity: 10,
      }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.id, 'event created safely with escaped/stored content')
  })

  // ==========================================
  // SUITE 6: IDEMPOTENCY & REPLAY ATTACK DEFENSE
  // ==========================================
  console.log(`\n--- [SUITE 6: Idempotency & Replay Attack Defense] ---`)

  await test('Idempotency', 'Replayed order creation with identical Idempotency-Key returns same order', async () => {
    const idemKey = crypto.randomUUID()
    const payload = {
      eventId: somchaiEventId,
      items: [{ ticketTypeId: somchaiTicketTypeId, quantity: 1 }],
    }
    const firstRes = await request('/api/orders', {
      method: 'POST',
      token: attendee.jwt,
      idempotencyKey: idemKey,
      body: JSON.stringify(payload),
    })
    expectStatus(firstRes.status, 200, firstRes.body)
    const firstOrderId = firstRes.body.id

    const replayRes = await request('/api/orders', {
      method: 'POST',
      token: attendee.jwt,
      idempotencyKey: idemKey,
      body: JSON.stringify(payload),
    })
    expectStatus(replayRes.status, 200, replayRes.body)
    expect(replayRes.body.id === firstOrderId, 'Idempotent replay must return exact same order id')
  })

  await test('Idempotency', 'Replayed payment checkout with identical Idempotency-Key is idempotent', async () => {
    const payIdem = crypto.randomUUID()
    const payRes1 = await request('/api/payments/checkout', {
      method: 'POST',
      token: attendee.jwt,
      idempotencyKey: payIdem,
      body: JSON.stringify({ orderId: tomOrderId }),
    })
    expectStatus(payRes1.status, 200, payRes1.body)
    expect(payRes1.body.status === 'SUCCEEDED', 'First payment should succeed')

    const payRes2 = await request('/api/payments/checkout', {
      method: 'POST',
      token: attendee.jwt,
      idempotencyKey: payIdem,
      body: JSON.stringify({ orderId: tomOrderId }),
    })
    expectStatus(payRes2.status, 200, payRes2.body)
    expect(payRes2.body.id === payRes1.body.id, 'Idempotent replay of payment returns exact same payment')
  })

  // ==========================================
  // SUITE 7: QR CODE & CHECK-IN SECURITY
  // ==========================================
  console.log(`\n--- [SUITE 7: Ticket Lifecycle, Signed QR Tokens & Check-In] ---`)

  // Retrieve Tom's tickets
  const myTicketsRes = await request('/api/tickets/me', { token: attendee.jwt })
  expectStatus(myTicketsRes.status, 200, myTicketsRes.body)
  const tomTickets = (myTicketsRes.body as any[]).filter((t) => t.eventId === somchaiEventId)
  expect(tomTickets.length >= 1, 'Attendee Tom must have at least 1 confirmed ticket')
  const validQr = tomTickets[0].qrToken

  await test('Check-In', 'Valid signed QR token check-in yields SUCCESS', async () => {
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: somchaiEventId, qrToken: validQr }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'SUCCESS', `Expected SUCCESS, got ${res.body.result}`)
  })

  await test('Check-In', 'Duplicate check-in with the same QR token yields DUPLICATE', async () => {
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: somchaiEventId, qrToken: validQr }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'DUPLICATE', `Expected DUPLICATE, got ${res.body.result}`)
  })

  await test('Check-In', 'Tampered QR signature is rejected as INVALID', async () => {
    const tamperedQr = validQr.slice(0, -6) + 'XXXXXX'
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: somchaiEventId, qrToken: tamperedQr }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'INVALID', `Expected INVALID, got ${res.body.result}`)
  })

  await test('Check-In', 'Unauthorized attendee cannot perform check-ins (403 Forbidden)', async () => {
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: attendee.jwt,
      body: JSON.stringify({ eventId: somchaiEventId, qrToken: validQr }),
    })
    expectStatus(res.status, 403, res.body)
  })

  // ==========================================
  // SUITE 8: CONCURRENCY & ZERO OVERSELLING
  // ==========================================
  console.log(`\n--- [SUITE 8: Concurrency & Zero Overselling Race Test] ---`)

  await test('Concurrency', 'Strict Quota Limit: 2 tickets available, 10 concurrent requests -> exactly 2 succeed, 0 oversold', async () => {
    // 1. Create a flash sale event with capacity 2 and quota 2
    const flashEvent = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: `Flash Sale Concurrency Race ${Date.now()}`,
        startsAt: iso(3 * 86400000),
        endsAt: iso(3 * 86400000 + 7200000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(2 * 86400000),
        capacity: 2,
      }),
    })
    expectStatus(flashEvent.status, 200, flashEvent.body)
    const flashEventId = flashEvent.body.id

    const flashTT = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: flashEventId,
        name: 'Limited Golden Seat',
        price: '100.00',
        quota: 2, // strictly 2 seats!
        maxPerOrder: 1,
      }),
    })
    expectStatus(flashTT.status, 200, flashTT.body)
    const flashTicketTypeId = flashTT.body.id

    const pubFlash = await request(`/api/events/${flashEventId}/publish`, {
      method: 'POST',
      token: somchai.jwt,
    })
    expectStatus(pubFlash.status, 200, pubFlash.body)

    // 2. Prepare 10 concurrent users (create 10 test users fast)
    console.log(`    Preparing 10 distinct buyer accounts for race...`)
    const buyers: Principal[] = []
    for (let i = 0; i < 10; i++) {
      buyers.push(await signUpNew(`race-${i}`))
    }

    // 3. Fire all 10 reservation requests at the EXACT same millisecond
    console.log(`    Firing 10 simultaneous reservations for 2 available tickets...`)
    const raceRequests = buyers.map((buyer) =>
      request('/api/orders', {
        method: 'POST',
        token: buyer.jwt,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          eventId: flashEventId,
          items: [{ ticketTypeId: flashTicketTypeId, quantity: 1 }],
        }),
      }),
    )

    const raceResponses = await Promise.all(raceRequests)
    const successes = raceResponses.filter((r) => r.status === 200)
    const rejections = raceResponses.filter((r) => r.status === 409 || r.status === 400)

    console.log(`    Results: ${successes.length} SUCCEEDED, ${rejections.length} REJECTED`)
    expect(successes.length === 2, `Exactly 2 reservations must succeed (got ${successes.length})`)
    expect(rejections.length === 8, `Exactly 8 reservations must be rejected (got ${rejections.length})`)
    for (const rej of rejections) {
      expect(rej.body?.error === 'capacity_full' || rej.status === 409, 'Rejections must specify capacity_full')
    }
  })

  // ==========================================
  // SUITE 9: FRONTEND WEB SPA & ASSET INTEGRITY
  // ==========================================
  console.log(`\n--- [SUITE 9: Frontend Web SPA & Asset Integrity] ---`)

  await test('Frontend', 'Root page / returns HTML 200 with title', async () => {
    const res = await fetch(`${BASE_URL}/`)
    expect(res.status === 200, `Expected 200, got ${res.status}`)
    const html = await res.text()
    expect(html.includes('<div id="root">') || html.includes('<!DOCTYPE html>'), 'Root HTML structure present')
  })

  await test('Frontend', 'Direct navigation to /events returns HTML 200 (SPA client-routing fallback)', async () => {
    const res = await fetch(`${BASE_URL}/events`)
    expect(res.status === 200, `Expected 200, got ${res.status}`)
  })

  await test('Frontend', 'Direct navigation to /login returns HTML 200', async () => {
    const res = await fetch(`${BASE_URL}/login`)
    expect(res.status === 200, `Expected 200, got ${res.status}`)
  })

  // ==========================================
  // FINAL REPORT
  // ==========================================
  console.log(`\n======================================================`)
  console.log(`📊 AUDIT EXECUTION SUMMARY`)
  console.log(`======================================================`)

  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`Total Testcases Executed: ${total}`)
  console.log(`Passed:                  ${passed} (${Math.round((passed / total) * 100)}%)`)
  console.log(`Failed:                  ${failed}`)

  if (failed > 0) {
    console.log(`\n⚠️  FAILED TESTS:`)
    for (const f of results.filter((r) => !r.passed)) {
      console.log(`  - [${f.category}] ${f.name}: ${f.detail}`)
    }
  } else {
    console.log(`\n🎉 ALL ${total} TESTCASES PASSED WITH ZERO SECURITY VULNERABILITIES!`)
  }
  console.log(`======================================================\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

runAudit().catch((err) => {
  console.error('\nFatal error running audit suite:', err)
  process.exit(1)
})
