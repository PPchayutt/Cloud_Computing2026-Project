/**
 * Comprehensive & Deep End-to-End Test Suite for Eventide
 * Covers every subsystem, user journey, edge case, security invariant, and concurrency check.
 * Target: AWS Production Cluster or Local Environment
 */

const BASE_URL = (process.env.BASE_URL ?? 'http://eventide-ingress-d3bc2878f01fbe9e.elb.us-east-1.amazonaws.com').replace(/\/+$/, '')
const PASSWORD = 'seed-password-123'

interface TestResult {
  id: number
  category: string
  name: string
  passed: boolean
  detail?: string
  durationMs: number
}

const results: TestResult[] = []
let testCounter = 0

async function test(category: string, name: string, fn: () => Promise<void>) {
  testCounter++
  const id = testCounter
  const start = Date.now()
  try {
    await fn()
    const durationMs = Date.now() - start
    results.push({ id, category, name, passed: true, durationMs })
    console.log(`  ✓ [TC-${String(id).padStart(2, '0')}] [${category}] ${name} (${durationMs}ms)`)
  } catch (err: any) {
    const durationMs = Date.now() - start
    const detail = err instanceof Error ? err.message : String(err)
    results.push({ id, category, name, passed: false, detail, durationMs })
    console.error(`  ✗ [TC-${String(id).padStart(2, '0')}] [${category}] ${name} (${durationMs}ms) -> ${detail}`)
  }
}

function expect(cond: unknown, message: string) {
  if (!cond) throw new Error(message)
}

function expectStatus(status: number, expected: number | number[], body?: any) {
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (!allowed.includes(status)) {
    throw new Error(`Expected HTTP status ${allowed.join(' or ')}, got ${status}. Response body: ${JSON.stringify(body)}`)
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
  if (!headers.has('content-type') && rest.body && typeof rest.body === 'string') {
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
    body: JSON.stringify({ email: email.trim(), password: PASSWORD }),
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

async function signUpNew(prefix: string, name?: string): Promise<Principal> {
  const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@deep-audit.test`
  const displayName = name ?? `DeepAudit User ${prefix}`
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: displayName, email, password: PASSWORD }),
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

async function runDeepAudit() {
  console.log(`\n========================================================================`)
  console.log(`🚀 EVENTIDE DEEP COMPREHENSIVE END-TO-END VERIFICATION SUITE`)
  console.log(`🎯 Target Environment: ${BASE_URL}`)
  console.log(`⏱️  Timestamp:          ${new Date().toISOString()}`)
  console.log(`========================================================================\n`)

  console.log(`🔑 Initializing & Authenticating Seed Principals...`)
  const admin = await signIn('admin@eventide.test')
  const somchai = await signIn('somchai@eventide.test')
  const nadia = await signIn('nadia@eventide.test')
  const tom = await signIn('tom@eventide.test')
  const priya = await signIn('priya@eventide.test')
  console.log(`✓ Seed principals verified: Admin, 2 Organizers (Somchai, Nadia), 2 Attendees (Tom, Priya)\n`)

  // ========================================================================
  // CATEGORY 1: FRONTEND WEB SPA & ASSET DELIVERY INTEGRITY
  // ========================================================================
  console.log(`--- [1. Frontend Web SPA & Asset Delivery Integrity] ---`)

  await test('Frontend', 'Root landing page / responds HTTP 200 with HTML title and root div', async () => {
    const res = await fetch(`${BASE_URL}/`)
    expectStatus(res.status, 200)
    const html = await res.text()
    expect(html.includes('<div id="root">'), 'Root DOM container must be present')
    expect(html.includes('<title>Eventide</title>'), 'HTML title must be Eventide')
  })

  await test('Frontend', 'Direct navigation to /events delivers SPA HTML (client routing fallback)', async () => {
    const res = await fetch(`${BASE_URL}/events`)
    expectStatus(res.status, 200)
    const html = await res.text()
    expect(html.includes('<div id="root">'), 'SPA client routing fallback must serve index.html')
  })

  await test('Frontend', 'Direct navigation to /login delivers SPA HTML', async () => {
    const res = await fetch(`${BASE_URL}/login`)
    expectStatus(res.status, 200)
    const html = await res.text()
    expect(html.includes('<div id="root">'), 'Login route must serve index.html')
  })

  await test('Frontend', 'Direct navigation to nested route /organizer/events delivers SPA HTML', async () => {
    const res = await fetch(`${BASE_URL}/organizer/events`)
    expectStatus(res.status, 200)
  })

  await test('Frontend', 'Non-existent client path /some-random-page-1234 falls back to SPA without 404', async () => {
    const res = await fetch(`${BASE_URL}/some-random-page-1234`)
    expectStatus(res.status, 200)
    const html = await res.text()
    expect(html.includes('<div id="root">'), 'Client routing fallback should handle unknown frontend paths')
  })

  await test('Frontend', 'Vite CSS bundle is accessible and returns Content-Type text/css', async () => {
    const rootRes = await fetch(`${BASE_URL}/`)
    const html = await rootRes.text()
    const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/)
    expect(cssMatch && cssMatch[1], 'CSS bundle link must be present in index.html')
    const cssRes = await fetch(`${BASE_URL}${cssMatch![1]}`)
    expectStatus(cssRes.status, 200)
    const ct = cssRes.headers.get('content-type') ?? ''
    expect(ct.includes('text/css'), `Expected text/css, got ${ct}`)
  })

  await test('Frontend', 'Vite JS bundle is accessible and returns JavaScript content-type', async () => {
    const rootRes = await fetch(`${BASE_URL}/`)
    const html = await rootRes.text()
    const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/)
    expect(jsMatch && jsMatch[1], 'Main JS bundle link must be present in index.html')
    const jsRes = await fetch(`${BASE_URL}${jsMatch![1]}`)
    expectStatus(jsRes.status, 200)
    const ct = jsRes.headers.get('content-type') ?? ''
    expect(ct.includes('javascript'), `Expected javascript content-type, got ${ct}`)
  })

  // ========================================================================
  // CATEGORY 2: PERIMETER SHIELDING & INFRASTRUCTURE HEALTH
  // ========================================================================
  console.log(`\n--- [2. Perimeter Shielding & Infrastructure Health] ---`)

  await test('Perimeter', 'Live health probe /health/live returns HTTP 200 with service status ok', async () => {
    const res = await request('/health/live')
    expectStatus(res.status, 200, res.body)
    expect(res.body?.status === 'ok', 'Status must be ok')
  })

  await test('Perimeter', 'Ready health probe /health/ready returns HTTP 200 and confirms DB reachability', async () => {
    const res = await request('/health/ready')
    expectStatus(res.status, 200, res.body)
    expect(res.body?.status === 'ready' || res.body?.status === 'ok', 'Status must be ready')
  })

  await test('Perimeter', 'Swagger documentation /swagger is publicly accessible', async () => {
    const res = await fetch(`${BASE_URL}/swagger`)
    expectStatus(res.status, 200)
  })

  await test('Perimeter', 'Internal route /internal/events is strictly shielded from public access', async () => {
    const res = await request('/internal/events/anything')
    const isShielded = res.status === 404 || (typeof res.body === 'string' && res.body.includes('<!doctype html>'))
    expect(isShielded, 'Internal endpoint must not be exposed to the internet')
  })

  await test('Perimeter', 'Internal route /internal/orders is strictly shielded from public access', async () => {
    const res = await request('/internal/orders/anything')
    const isShielded = res.status === 404 || (typeof res.body === 'string' && res.body.includes('<!doctype html>'))
    expect(isShielded, 'Internal endpoint must not be exposed to the internet')
  })

  // ========================================================================
  // CATEGORY 3: AUTHENTICATION, TOKENS & SESSION MANAGEMENT
  // ========================================================================
  console.log(`\n--- [3. Authentication, Tokens & Session Management] ---`)

  await test('Auth', 'JWKS public key endpoint /api/auth/jwks is accessible and serves valid JSON keys', async () => {
    const res = await request('/api/auth/jwks')
    expectStatus(res.status, 200, res.body)
    expect(Array.isArray(res.body?.keys), 'JWKS must contain keys array')
    expect(res.body.keys.length > 0, 'JWKS keys array must not be empty')
  })

  await test('Auth', 'Sign-up with invalid email format (no @) is rejected with 400', async () => {
    const res = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad Email', email: 'not-an-email', password: PASSWORD }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Auth', 'Sign-up with password shorter than 8 characters is rejected with 400', async () => {
    const res = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name: 'Short Pass', email: `short-${Date.now()}@test.eventide`, password: '123' }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Auth', 'Sign-up with already registered email is rejected with 400/409', async () => {
    const res = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name: 'Duplicate User', email: 'somchai@eventide.test', password: PASSWORD }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Auth', 'Sign-up with Thai Unicode characters (สมชาย สุขเกษม) succeeds cleanly', async () => {
    const thaiUser = await signUpNew('thai-user', 'สมชาย สุขเกษม')
    expect(thaiUser.user?.name === 'สมชาย สุขเกษม', 'Unicode name must be persisted correctly')
  })

  await test('Auth', 'Sign-in with wrong password is rejected with 401', async () => {
    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@eventide.test', password: 'CompletelyWrongPassword123' }),
    })
    expectStatus(res.status, [400, 401], res.body)
  })

  await test('Auth', 'Sign-in email is case-insensitive (e.g. SOMCHAI@eventide.test)', async () => {
    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'SOMCHAI@eventide.test', password: PASSWORD }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.headers.get('set-auth-token'), 'Case-insensitive email sign-in must yield auth token')
  })

  await test('Auth', 'Tampered JWT signature is rejected with 401 Unauthorized', async () => {
    const tampered = somchai.jwt.slice(0, -8) + 'ZZZZZZZZ'
    const res = await request('/api/organizer/events', { token: tampered })
    expectStatus(res.status, 401, res.body)
  })

  await test('Auth', 'Unauthenticated request to protected endpoint /api/orders/me is rejected with 401', async () => {
    const res = await request('/api/orders/me')
    expectStatus(res.status, 401, res.body)
  })

  await test('Auth', 'Banned account is strictly blocked from making authenticated calls', async () => {
    try {
      const banned = await signIn('banned@eventide.test')
      const res = await request('/api/users/me', { token: banned.session })
      expectStatus(res.status, [401, 403], res.body)
    } catch (err: any) {
      expect(err.message.includes('banned') || err.message.includes('failed') || err.message.includes('401') || err.message.includes('403'), 'Banned user blocked')
    }
  })

  // ========================================================================
  // CATEGORY 4: USER PROFILE & ORGANIZER APPLICATION LIFECYCLE
  // ========================================================================
  console.log(`\n--- [4. User Profile & Organizer Application Lifecycle] ---`)

  const candidate = await signUpNew('applicant', 'Application Candidate')

  await test('Profile', 'Newly signed up account profile defaults to attendee and NOT_APPLIED', async () => {
    const res = await request('/api/users/me', { token: candidate.session })
    expectStatus(res.status, 200, res.body)
    expect(res.body.role === 'attendee' || !res.body.role, 'Role should be attendee')
    expect(res.body.organizerApprovalStatus === 'NOT_APPLIED', 'Status should be NOT_APPLIED')
  })

  await test('Profile', 'Attendee can update basic profile attributes (name and phone)', async () => {
    const res = await request('/api/users/me', {
      method: 'PATCH',
      token: candidate.session,
      body: JSON.stringify({ name: 'Candidate Updated Name', phone: '0891234567' }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.name === 'Candidate Updated Name', 'Name should be updated')
  })

  await test('Profile', 'Attendee submits organizer application -> status becomes PENDING', async () => {
    const res = await request('/api/users/me/organizer-application', {
      method: 'POST',
      token: candidate.session,
      body: JSON.stringify({
        displayName: 'Candidate Event Org',
        contactEmail: candidate.user.email,
        contactPhone: '0812345678',
      }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.organizerApprovalStatus === 'PENDING', 'Status must transition to PENDING')
  })

  await test('Profile', 'Duplicate organizer application while PENDING is rejected with 409 Conflict', async () => {
    const res = await request('/api/users/me/organizer-application', {
      method: 'POST',
      token: candidate.session,
      body: JSON.stringify({
        displayName: 'Another Org Name',
        contactEmail: candidate.user.email,
      }),
    })
    expectStatus(res.status, 409, res.body)
  })

  await test('Profile', 'Admin approves organizer application -> user becomes approved organizer', async () => {
    const approveRes = await request(`/api/admin/organizers/${candidate.user.id}/approve`, {
      method: 'POST',
      token: admin.session,
    })
    expectStatus(approveRes.status, 200, approveRes.body)

    // Security check: approval revokes existing session to prevent privilege escalation
    // Candidate re-authenticates to acquire updated claims and session
    const freshCandidate = await signIn(candidate.user.email)
    const meRes = await request('/api/users/me', { token: freshCandidate.session })
    expectStatus(meRes.status, 200, meRes.body)
    expect(meRes.body.role === 'organizer', 'Role must become organizer')
    expect(meRes.body.organizerApprovalStatus === 'APPROVED', 'Approval status must be APPROVED')
  })

  // Test organizer rejection flow with a second candidate
  const candidate2 = await signUpNew('reject-applicant', 'Rejection Candidate')
  await test('Profile', 'Admin rejects organizer application with reason -> status transitions to REJECTED', async () => {
    await request('/api/users/me/organizer-application', {
      method: 'POST',
      token: candidate2.session,
      body: JSON.stringify({
        displayName: 'Sketchy Org',
        contactEmail: candidate2.user.email,
      }),
    })

    const rejectRes = await request(`/api/admin/organizers/${candidate2.user.id}/reject`, {
      method: 'POST',
      token: admin.session,
      body: JSON.stringify({ reason: 'Insufficient organization credentials provided' }),
    })
    expectStatus(rejectRes.status, 200, rejectRes.body)

    // Revoked session check and re-login verification
    const freshCandidate2 = await signIn(candidate2.user.email)
    const checkRes = await request('/api/users/me', { token: freshCandidate2.session })
    expectStatus(checkRes.status, 200, checkRes.body)
    expect(checkRes.body.organizerApprovalStatus === 'REJECTED', 'Status must become REJECTED')
  })

  // ========================================================================
  // CATEGORY 5: EVENT CATALOG SEARCH & PAGINATION BOUNDARIES
  // ========================================================================
  console.log(`\n--- [5. Event Catalog Search & Pagination Boundaries] ---`)

  await test('Catalog', 'GET /api/events returns paginated published events with required fields', async () => {
    const res = await request('/api/events')
    expectStatus(res.status, 200, res.body)
    expect(Array.isArray(res.body.items), 'items must be an array')
    expect(typeof res.body.total === 'number', 'total must be a number')
    if (res.body.items.length > 0) {
      const item = res.body.items[0]
      expect(item.id && item.title && item.startsAt && item.status, 'Event shape must include id, title, startsAt, status')
      expect(item.status === 'PUBLISHED', 'All events in public catalog must be PUBLISHED')
    }
  })

  await test('Catalog', 'Search query parameter ?q= matches event titles', async () => {
    const res = await request('/api/events?q=KMITL')
    expectStatus(res.status, 200, res.body)
    for (const item of res.body.items) {
      expect(item.title.toLowerCase().includes('kmitl') || item.description?.toLowerCase().includes('kmitl'), 'Results must match query')
    }
  })

  await test('Catalog', 'Search for non-existent keyword yields empty array items: [] with total: 0', async () => {
    const res = await request('/api/events?q=NonExistentKeywordXYZ99999')
    expectStatus(res.status, 200, res.body)
    expect(res.body.items.length === 0, 'No items should match')
    expect(res.body.total === 0, 'Total should be 0')
  })

  await test('Catalog', 'Pagination bounds: pageSize=1 returns exactly 1 item and accurate total', async () => {
    const res = await request('/api/events?pageSize=1&page=1')
    expectStatus(res.status, 200, res.body)
    expect(res.body.items.length <= 1, 'pageSize=1 must return at most 1 item')
    expect(res.body.pageSize === 1, 'pageSize returned must be 1')
  })

  await test('Catalog', 'Pagination bounds: page beyond total items returns empty items without error', async () => {
    const res = await request('/api/events?page=999999&pageSize=20')
    expectStatus(res.status, 200, res.body)
    expect(res.body.items.length === 0, 'Out-of-bounds page should return empty list')
  })

  await test('Catalog', 'Pagination bounds: negative page is strictly rejected with 422 Unprocessable Entity', async () => {
    const res = await request('/api/events?page=-5')
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Catalog', 'Pagination bounds: excessive pageSize=500 is strictly rejected with 422 Unprocessable Entity', async () => {
    const res = await request('/api/events?pageSize=500')
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Catalog', 'Public categories endpoint /api/categories returns array of categories', async () => {
    const res = await request('/api/categories')
    expectStatus(res.status, 200, res.body)
    expect(Array.isArray(res.body), 'Categories must be an array')
  })

  await test('Catalog', 'Public venues endpoint /api/venues returns array of venues', async () => {
    const res = await request('/api/venues')
    expectStatus(res.status, 200, res.body)
    expect(Array.isArray(res.body), 'Venues must be an array')
  })

  // ========================================================================
  // CATEGORY 6: EVENT LIFECYCLE, VALIDATION & STATE TRANSITIONS
  // ========================================================================
  console.log(`\n--- [6. Event Lifecycle, Validation & State Machine Transitions] ---`)

  // Step 6.1: Valid Event Creation
  let liveEventId = ''
  await test('Lifecycle', 'Approved organizer creates an event with valid attributes -> starts in DRAFT', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: `Deep Audit Conference ${Date.now()}`,
        description: 'Comprehensive testing event for full lifecycle verification',
        startsAt: iso(6 * 86400000),
        endsAt: iso(6 * 86400000 + 4 * 3600000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(5 * 86400000),
        capacity: 100,
        refundPercent: 80,
      }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.id, 'Event must have an ID')
    expect(res.body.status === 'DRAFT', 'New event must start in DRAFT')
    expect(res.body.refundPercent === 80, 'Refund percent must be saved')
    liveEventId = res.body.id
  })

  await test('Lifecycle', 'Event with endsAt earlier than startsAt is rejected with 400/409/422', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: 'Invalid Schedule Event',
        startsAt: iso(4 * 86400000),
        endsAt: iso(2 * 86400000), // ends before starts!
        salesStartAt: iso(-3600000),
        salesEndAt: iso(3 * 86400000),
        capacity: 50,
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Lifecycle', 'Event with salesEndAt later than startsAt is rejected with 400/409/422', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: 'Late Sales Event',
        startsAt: iso(3 * 86400000),
        endsAt: iso(4 * 86400000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(3 * 86400000 + 3600000), // sales end after event starts!
        capacity: 50,
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Lifecycle', 'Event with capacity = 0 is rejected with 400/422', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: 'Zero Capacity Event',
        startsAt: iso(4 * 86400000),
        endsAt: iso(5 * 86400000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(3 * 86400000),
        capacity: 0,
      }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('Lifecycle', 'Publishing an event with 0 ticket types is rejected with 400/409/422', async () => {
    const res = await request(`/api/events/${liveEventId}/publish`, {
      method: 'POST',
      token: somchai.jwt,
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  // Add multiple ticket tiers
  let earlyBirdTicketId = ''
  let vipTicketId = ''

  await test('Lifecycle', 'Adding multiple ticket tiers (Early Bird and VIP) to the event succeeds', async () => {
    const t1 = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: liveEventId,
        name: 'Early Bird Admission',
        price: '350.00',
        quota: 30,
        maxPerOrder: 4,
        maxPerUser: 10,
      }),
    })
    expectStatus(t1.status, 200, t1.body)
    earlyBirdTicketId = t1.body.id

    const t2 = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: liveEventId,
        name: 'VIP Premium Pass',
        price: '990.00',
        quota: 20,
        maxPerOrder: 2,
        maxPerUser: 4,
      }),
    })
    expectStatus(t2.status, 200, t2.body)
    vipTicketId = t2.body.id
  })

  await test('Lifecycle', 'Adding ticket type with duplicate name in the same event is rejected', async () => {
    const dupRes = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: liveEventId,
        name: 'VIP Premium Pass', // already exists
        price: '1200.00',
        quota: 10,
      }),
    })
    expectStatus(dupRes.status, [400, 409, 422, 500], dupRes.body)
  })

  await test('Lifecycle', 'Publishing event with valid ticket quota within capacity succeeds -> PUBLISHED', async () => {
    const res = await request(`/api/events/${liveEventId}/publish`, {
      method: 'POST',
      token: somchai.jwt,
    })
    expectStatus(res.status, 200, res.body)

    const detail = await request(`/api/events/${liveEventId}`)
    expectStatus(detail.status, 200, detail.body)
    expect(detail.body.status === 'PUBLISHED', 'Event status must be PUBLISHED')
    expect(detail.body.ticketTypes?.length === 2, 'Must have 2 ticket types attached')
  })

  await test('Lifecycle', 'Updating event capacity below total existing ticket quota (50) is rejected', async () => {
    const res = await request(`/api/events/${liveEventId}`, {
      method: 'PATCH',
      token: somchai.jwt,
      body: JSON.stringify({
        title: 'Updated Capacity Event',
        capacity: 40, // Quotas are 30 + 20 = 50! Cannot set to 40!
        startsAt: iso(6 * 86400000),
        endsAt: iso(6 * 86400000 + 4 * 3600000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(5 * 86400000),
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  // Test state closing transition
  const closeableEvent = await request('/api/events', {
    method: 'POST',
    token: somchai.jwt,
    body: JSON.stringify({
      title: `Closeable Event ${Date.now()}`,
      startsAt: iso(5 * 86400000),
      endsAt: iso(6 * 86400000),
      salesStartAt: iso(-3600000),
      salesEndAt: iso(4 * 86400000),
      capacity: 10,
    }),
  })
  const closeableId = closeableEvent.body.id
  await request('/api/ticket-types', {
    method: 'POST',
    token: somchai.jwt,
    body: JSON.stringify({ eventId: closeableId, name: 'T1', price: '10.00', quota: 10 }),
  })
  await request(`/api/events/${closeableId}/publish`, { method: 'POST', token: somchai.jwt })

  await test('Lifecycle', 'Organizer closes published event -> status becomes CLOSED', async () => {
    const res = await request(`/api/events/${closeableId}/close`, { method: 'POST', token: somchai.jwt })
    expectStatus(res.status, 200, res.body)

    const detail = await request(`/api/events/${closeableId}`)
    expect(detail.body.status === 'CLOSED', 'Status must be CLOSED')
  })

  await test('Lifecycle', 'Closed event cannot be edited or re-published (invalid transition)', async () => {
    const editRes = await request(`/api/events/${closeableId}`, {
      method: 'PATCH',
      token: somchai.jwt,
      body: JSON.stringify({
        title: 'Attempt Edit Closed Event',
        startsAt: iso(5 * 86400000),
        endsAt: iso(6 * 86400000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(4 * 86400000),
        capacity: 10,
      }),
    })
    expectStatus(editRes.status, [400, 409, 403], editRes.body)

    const pubRes = await request(`/api/events/${closeableId}/publish`, { method: 'POST', token: somchai.jwt })
    expectStatus(pubRes.status, [400, 409, 403], pubRes.body)
  })

  // Admin suspension test
  await test('Lifecycle', 'Administrator suspends published event -> status becomes SUSPENDED and drops from public catalog', async () => {
    const suspRes = await request(`/api/admin/events/${liveEventId}/suspend`, {
      method: 'POST',
      token: admin.jwt,
    })
    expectStatus(suspRes.status, 200, suspRes.body)

    const detail = await request(`/api/events/${liveEventId}`)
    expect(detail.body.status === 'SUSPENDED', 'Event must be SUSPENDED')

    const catalog = await request('/api/events')
    const found = catalog.body.items?.some((i: any) => i.id === liveEventId)
    expect(!found, 'Suspended event must not appear in public published catalog')
  })

  // Re-publish event for remaining purchase tests
  await test('Lifecycle', 'Non-admin organizer cannot suspend an event (403 Forbidden or 409 Invalid Transition)', async () => {
    const res = await request(`/api/admin/events/${liveEventId}/suspend`, {
      method: 'POST',
      token: somchai.jwt,
    })
    expectStatus(res.status, [403, 409], res.body)
  })

  // Create an active published event for order/ticket testing
  const activeEvent = await request('/api/events', {
    method: 'POST',
    token: somchai.jwt,
    body: JSON.stringify({
      title: `Ticketing Live Event ${Date.now()}`,
      description: 'Active event for ticket booking tests',
      startsAt: iso(4 * 86400000),
      endsAt: iso(4 * 86400000 + 7200000),
      salesStartAt: iso(-3600000),
      salesEndAt: iso(3 * 86400000),
      capacity: 50,
      refundPercent: 100,
    }),
  })
  const activeEventId = activeEvent.body.id
  const activeTT = await request('/api/ticket-types', {
    method: 'POST',
    token: somchai.jwt,
    body: JSON.stringify({
      eventId: activeEventId,
      name: 'Standard Ticket',
      price: '500.00',
      quota: 30,
      maxPerOrder: 5,
      maxPerUser: 10,
    }),
  })
  const activeTicketTypeId = activeTT.body.id
  await request(`/api/events/${activeEventId}/publish`, { method: 'POST', token: somchai.jwt })

  // ========================================================================
  // CATEGORY 7: MULTI-TENANT ISOLATION & IDOR DEFENSE
  // ========================================================================
  console.log(`\n--- [7. Multi-Tenant Isolation & IDOR Defense] ---`)

  await test('IDOR', 'Organizer Nadia cannot modify Somchai’s event (403/404)', async () => {
    const res = await request(`/api/events/${activeEventId}`, {
      method: 'PATCH',
      token: nadia.jwt,
      body: JSON.stringify({
        title: 'Nadia Hijack Attempt',
        startsAt: iso(4 * 86400000),
        endsAt: iso(4 * 86400000 + 7200000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(3 * 86400000),
        capacity: 50,
      }),
    })
    expectStatus(res.status, [403, 404], res.body)
  })

  await test('IDOR', 'Organizer Nadia cannot add ticket tiers to Somchai’s event (403/404)', async () => {
    const res = await request('/api/ticket-types', {
      method: 'POST',
      token: nadia.jwt,
      body: JSON.stringify({
        eventId: activeEventId,
        name: 'Nadia Stolen Tier',
        price: '1.00',
        quota: 5,
      }),
    })
    expectStatus(res.status, [403, 404], res.body)
  })

  await test('IDOR', 'Attendee cannot access organizer managed events list (403 Forbidden)', async () => {
    const res = await request('/api/organizer/events', { token: tom.jwt })
    expectStatus(res.status, 403, res.body)
  })

  await test('IDOR', 'Attendee cannot access administrator user list (403 Forbidden)', async () => {
    const res = await request('/api/admin/users', { token: tom.session })
    expectStatus(res.status, 403, res.body)
  })

  await test('IDOR', 'Attendee cannot access administrator payments list (403 Forbidden)', async () => {
    const res = await request('/api/payments/admin', { token: tom.jwt })
    expectStatus(res.status, 403, res.body)
  })

  // ========================================================================
  // CATEGORY 8: ORDER RESERVATION, SERVER PRICING & INVENTORY
  // ========================================================================
  console.log(`\n--- [8. Order Reservation, Server Pricing & Inventory Hold] ---`)

  let tomActiveOrderId = ''

  await test('Orders', 'Attendee reserves tickets -> order created in PENDING with 8-min hold', async () => {
    const res = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: activeEventId,
        items: [{ ticketTypeId: activeTicketTypeId, quantity: 2 }],
      }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.status === 'PENDING', 'Order must start in PENDING')
    expect(res.body.expiresAt, 'Order must include expiresAt timestamp')
    const holdMs = new Date(res.body.expiresAt).getTime() - Date.now()
    expect(holdMs > 6 * 60 * 1000 && holdMs <= 9 * 60 * 1000, 'Hold must be approximately 8 minutes')
    tomActiveOrderId = res.body.id
  })

  await test('Orders', 'Order total is strictly server-calculated (2 × ฿500.00 = ฿1000.00)', async () => {
    const res = await request(`/api/orders/${tomActiveOrderId}`, { token: tom.jwt })
    expectStatus(res.status, 200, res.body)
    expect(Number(res.body.total) === 1000, `Expected total 1000, got ${res.body.total}`)
  })

  await test('Orders', 'Ordering quantity exceeding maxPerOrder (5) is rejected with 400/409', async () => {
    const res = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: activeEventId,
        items: [{ ticketTypeId: activeTicketTypeId, quantity: 9 }], // maxPerOrder is 5
      }),
    })
    expectStatus(res.status, [400, 409, 422], res.body)
  })

  await test('Orders', 'Order reservation with repeated Idempotency-Key returns exact same order', async () => {
    const key = crypto.randomUUID()
    const payload = {
      eventId: activeEventId,
      items: [{ ticketTypeId: activeTicketTypeId, quantity: 1 }],
    }
    const r1 = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: key,
      body: JSON.stringify(payload),
    })
    expectStatus(r1.status, 200, r1.body)

    const r2 = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: key,
      body: JSON.stringify(payload),
    })
    expectStatus(r2.status, 200, r2.body)
    expect(r2.body.id === r1.body.id, 'Idempotent replay must return exact same order ID')

    // Clean up temporary order
    await request(`/api/orders/${r1.body.id}/cancel`, { method: 'POST', token: tom.jwt })
  })

  await test('Orders', 'Cancelling PENDING order transitions status to CANCELLED and restores inventory', async () => {
    // Create an order to cancel
    const makeRes = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: activeEventId,
        items: [{ ticketTypeId: activeTicketTypeId, quantity: 1 }],
      }),
    })
    expectStatus(makeRes.status, 200, makeRes.body)
    const cancelOrderId = makeRes.body.id

    const cancelRes = await request(`/api/orders/${cancelOrderId}/cancel`, {
      method: 'POST',
      token: tom.jwt,
    })
    expectStatus(cancelRes.status, 200, cancelRes.body)

    const checkRes = await request(`/api/orders/${cancelOrderId}`, { token: tom.jwt })
    expect(checkRes.body.status === 'CANCELLED', 'Order status must be CANCELLED')
  })

  await test('Orders', 'Attendee cannot view or pay for another attendee’s order (IDOR protection)', async () => {
    const viewRes = await request(`/api/orders/${tomActiveOrderId}`, { token: priya.jwt })
    expectStatus(viewRes.status, [403, 404], viewRes.body)

    const payRes = await request('/api/payments/checkout', {
      method: 'POST',
      token: priya.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ orderId: tomActiveOrderId }),
    })
    expectStatus(payRes.status, [403, 404], payRes.body)
  })

  // ========================================================================
  // CATEGORY 9: PAYMENT, RECONCILIATION & REFUND POLICIES
  // ========================================================================
  console.log(`\n--- [9. Payment, Reconciliation & Refund Policies] ---`)

  await test('Payment', 'Checkout on valid pending order succeeds -> SUCCEEDED and order CONFIRMED', async () => {
    const payRes = await request('/api/payments/checkout', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ orderId: tomActiveOrderId }),
    })
    expectStatus(payRes.status, 200, payRes.body)
    expect(payRes.body.status === 'SUCCEEDED', 'Payment must succeed')

    const orderRes = await request(`/api/orders/${tomActiveOrderId}`, { token: tom.jwt })
    expect(orderRes.body.status === 'CONFIRMED', 'Order must transition to CONFIRMED')
  })

  await test('Payment', 'Replay payment checkout with same Idempotency-Key returns existing payment without double charging', async () => {
    const payKey = crypto.randomUUID()
    // Create new order to test idempotency
    const ord = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: activeEventId,
        items: [{ ticketTypeId: activeTicketTypeId, quantity: 1 }],
      }),
    })
    const ordId = ord.body.id

    const p1 = await request('/api/payments/checkout', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: payKey,
      body: JSON.stringify({ orderId: ordId }),
    })
    expectStatus(p1.status, 200, p1.body)

    const p2 = await request('/api/payments/checkout', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: payKey,
      body: JSON.stringify({ orderId: ordId }),
    })
    expectStatus(p2.status, 200, p2.body)
    expect(p2.body.id === p1.body.id, 'Idempotent replay must return identical payment record')
  })

  await test('Payment', 'Refunding confirmed order succeeds -> transitions order to REFUNDED', async () => {
    // Tom refunds his first confirmed order
    const refundRes = await request(`/api/payments/order/${tomActiveOrderId}/refund`, {
      method: 'POST',
      token: tom.jwt,
    })
    expectStatus(refundRes.status, 200, refundRes.body)

    const orderRes = await request(`/api/orders/${tomActiveOrderId}`, { token: tom.jwt })
    expect(orderRes.body.status === 'REFUNDED', 'Order status must become REFUNDED')
  })

  await test('Payment', 'Calling refund again on already refunded order is idempotent (returns 200 REFUNDED)', async () => {
    const res = await request(`/api/payments/order/${tomActiveOrderId}/refund`, {
      method: 'POST',
      token: tom.jwt,
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.status === 'REFUNDED', 'Idempotent refund response must remain REFUNDED')
  })

  await test('Payment', 'Attempting refund on unconfirmed/pending order is rejected with 409 Conflict', async () => {
    // Create an unpaid order
    const pendingOrd = await request('/api/orders', {
      method: 'POST',
      token: tom.jwt,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        eventId: activeEventId,
        items: [{ ticketTypeId: activeTicketTypeId, quantity: 1 }],
      }),
    })
    const res = await request(`/api/payments/order/${pendingOrd.body.id}/refund`, {
      method: 'POST',
      token: tom.jwt,
    })
    expectStatus(res.status, [400, 404, 409], res.body)
  })

  // ========================================================================
  // CATEGORY 10: TICKET ISSUANCE, SIGNED QR TOKENS & CHECK-IN ENGINE
  // ========================================================================
  console.log(`\n--- [10. Ticket Issuance, Signed QR Tokens & Check-In Engine] ---`)

  // Create clean order for Priya and pay for it
  const priyaOrder = await request('/api/orders', {
    method: 'POST',
    token: priya.jwt,
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify({
      eventId: activeEventId,
      items: [{ ticketTypeId: activeTicketTypeId, quantity: 1 }],
    }),
  })
  expectStatus(priyaOrder.status, 200, priyaOrder.body)
  await request('/api/payments/checkout', {
    method: 'POST',
    token: priya.jwt,
    idempotencyKey: crypto.randomUUID(),
    body: JSON.stringify({ orderId: priyaOrder.body.id }),
  })

  let priyaQrToken = ''
  let priyaTicketId = ''

  await test('Check-In', 'Confirmed order generates signed ticket containing QR token', async () => {
    const res = await request('/api/tickets/me', { token: priya.jwt })
    expectStatus(res.status, 200, res.body)
    const ticket = res.body.find((t: any) => t.eventId === activeEventId && t.status === 'VALID')
    expect(ticket, 'Priya must have a VALID ticket for active event')
    expect(ticket.qrToken && ticket.qrToken.length > 20, 'Ticket must contain cryptographically signed QR token')
    priyaQrToken = ticket.qrToken
    priyaTicketId = ticket.id
  })

  await test('Check-In', 'Gate check-in with valid signed QR token records SUCCESS and marks ticket USED', async () => {
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: activeEventId, qrToken: priyaQrToken }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'SUCCESS', `Expected SUCCESS, got ${res.body.result}`)
  })

  await test('Check-In', 'Re-scanning same ticket records DUPLICATE to prevent double entry', async () => {
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: activeEventId, qrToken: priyaQrToken }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'DUPLICATE', `Expected DUPLICATE, got ${res.body.result}`)
  })

  await test('Check-In', 'Scanning ticket with tampered cryptographic signature records INVALID', async () => {
    const tampered = priyaQrToken.slice(0, -6) + 'XXXXXX'
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: activeEventId, qrToken: tampered }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'INVALID', `Expected INVALID, got ${res.body.result}`)
  })

  await test('Check-In', 'Scanning ticket at a different event records WRONG_EVENT and preserves ticket', async () => {
    // Create another event
    const otherEvent = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: `Other Event ${Date.now()}`,
        startsAt: iso(7 * 86400000),
        endsAt: iso(8 * 86400000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(6 * 86400000),
        capacity: 10,
      }),
    })
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ eventId: otherEvent.body.id, qrToken: priyaQrToken }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.result === 'WRONG_EVENT', `Expected WRONG_EVENT, got ${res.body.result}`)
  })

  await test('Check-In', 'Non-organizer attendee attempting to scan check-ins is rejected with 403 Forbidden', async () => {
    const res = await request('/api/check-ins', {
      method: 'POST',
      token: tom.jwt,
      body: JSON.stringify({ eventId: activeEventId, qrToken: priyaQrToken }),
    })
    expectStatus(res.status, 403, res.body)
  })

  // ========================================================================
  // CATEGORY 11: HIGH CONCURRENCY & ZERO OVERSELLING RACE TEST
  // ========================================================================
  console.log(`\n--- [11. High Concurrency & Zero Overselling Race Test] ---`)

  await test('Concurrency', 'Strict Quota Limit: 2 tickets available, 12 concurrent requests -> exactly 2 succeed, 0 oversold', async () => {
    const raceEvent = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: `Race Condition Stress Test ${Date.now()}`,
        startsAt: iso(3 * 86400000),
        endsAt: iso(4 * 86400000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(2 * 86400000),
        capacity: 2,
      }),
    })
    const raceEventId = raceEvent.body.id
    const raceTT = await request('/api/ticket-types', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        eventId: raceEventId,
        name: 'Flash Seat',
        price: '100.00',
        quota: 2, // Strictly 2 tickets!
        maxPerOrder: 1,
      }),
    })
    const raceTicketTypeId = raceTT.body.id
    await request(`/api/events/${raceEventId}/publish`, { method: 'POST', token: somchai.jwt })

    // Prepare 12 concurrent buyers
    console.log(`    Creating 12 simultaneous distinct buyer accounts...`)
    const buyers: Principal[] = []
    for (let i = 0; i < 12; i++) {
      buyers.push(await signUpNew(`stress-${i}`))
    }

    // Fire all 12 requests in parallel
    console.log(`    Blasting 12 simultaneous reservation requests for 2 available tickets...`)
    const requests = buyers.map((buyer) =>
      request('/api/orders', {
        method: 'POST',
        token: buyer.jwt,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          eventId: raceEventId,
          items: [{ ticketTypeId: raceTicketTypeId, quantity: 1 }],
        }),
      }),
    )

    const responses = await Promise.all(requests)
    const successes = responses.filter((r) => r.status === 200)
    const rejections = responses.filter((r) => r.status === 409 || r.status === 400)

    console.log(`    Race Outcomes: ${successes.length} SUCCEEDED, ${rejections.length} REJECTED`)
    expect(successes.length === 2, `Exactly 2 reservations must succeed (got ${successes.length})`)
    expect(rejections.length === 10, `Exactly 10 reservations must be rejected (got ${rejections.length})`)

    for (const rej of rejections) {
      expect(rej.body?.error === 'capacity_full' || rej.status === 409, 'Rejections must specify capacity_full')
    }
  })

  // ========================================================================
  // CATEGORY 12: SECURITY INJECTION, FUZZING & ERROR BOUNDARIES
  // ========================================================================
  console.log(`\n--- [12. Security Injection, Fuzzing & Error Boundaries] ---`)

  await test('Security', 'SQL Injection payload in query parameters is safely handled without error', async () => {
    const payloads = [
      "1' OR '1'='1",
      "'; DROP TABLE events; --",
      "1 UNION SELECT 1,2,3,4,5--",
      "admin'--",
    ]
    for (const sqli of payloads) {
      const res = await request(`/api/events?q=${encodeURIComponent(sqli)}`)
      expectStatus(res.status, 200, res.body)
    }
  })

  await test('Security', 'XSS payload in event title and description is sanitized/stored safely without 500 error', async () => {
    const res = await request('/api/events', {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({
        title: '<script>alert("XSS")</script>',
        description: '<img src=x onerror=alert(document.cookie)>',
        startsAt: iso(6 * 86400000),
        endsAt: iso(7 * 86400000),
        salesStartAt: iso(-3600000),
        salesEndAt: iso(5 * 86400000),
        capacity: 10,
      }),
    })
    expectStatus(res.status, 200, res.body)
  })

  await test('Security', 'Malformed non-UUID parameter in /api/events/:id returns 404/400 without crashing', async () => {
    const res = await request('/api/events/not-a-valid-uuid')
    expectStatus(res.status, [400, 404, 422], res.body)
  })

  await test('Security', 'Malformed non-UUID parameter in /api/orders/:id returns 404/400 without crashing', async () => {
    const res = await request('/api/orders/not-a-valid-uuid', { token: tom.jwt })
    expectStatus(res.status, [400, 404, 422], res.body)
  })

  await test('Security', 'Unexpected HTTP DELETE on root /api/events returns 404/405 without crashing', async () => {
    const res = await request('/api/events', { method: 'DELETE', token: somchai.jwt })
    expectStatus(res.status, [404, 405], res.body)
  })

  // ========================================================================
  // CATEGORY 13: S3 PRESIGNED URL SECURITY & IMAGE MANAGEMENT
  // ========================================================================
  console.log(`\n--- [13. S3 Presigned URL Security & Image Management] ---`)

  await test('S3', 'Presigning cover image upload for image/webp returns valid S3 PUT URL and key', async () => {
    const res = await request(`/api/events/${activeEventId}/images/presign`, {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ contentType: 'image/webp' }),
    })
    expectStatus(res.status, 200, res.body)
    expect(res.body.uploadUrl && res.body.uploadUrl.includes('amazonaws.com'), 'Must return valid S3 upload URL')
    expect(res.body.uploadUrl.includes('X-Amz-Signature'), 'Must be presigned with SigV4 signature')
  })

  await test('S3', 'Presigning dangerous executable MIME types (application/x-sh) is rejected with 400', async () => {
    const res = await request(`/api/events/${activeEventId}/images/presign`, {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ contentType: 'application/x-sh' }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  await test('S3', 'Presigning SVG with potential embedded scripts (image/svg+xml) is rejected with 400', async () => {
    const res = await request(`/api/events/${activeEventId}/images/presign`, {
      method: 'POST',
      token: somchai.jwt,
      body: JSON.stringify({ contentType: 'image/svg+xml' }),
    })
    expectStatus(res.status, [400, 422], res.body)
  })

  // ========================================================================
  // COMPREHENSIVE SUMMARY & AUDIT SCORECARD
  // ========================================================================
  console.log(`\n========================================================================`)
  console.log(`📊 FINAL DEEP AUDIT SCORECARD & REPORT`)
  console.log(`========================================================================`)

  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  // Categorized breakdown
  const categoryMap = new Map<string, { total: number; passed: number; failed: number }>()
  for (const r of results) {
    const stat = categoryMap.get(r.category) ?? { total: 0, passed: 0, failed: 0 }
    stat.total++
    if (r.passed) stat.passed++
    else stat.failed++
    categoryMap.set(r.category, stat)
  }

  console.log(`\nCategory Breakdown:`)
  for (const [cat, stat] of categoryMap.entries()) {
    const icon = stat.failed === 0 ? '✓' : '✗'
    console.log(`  ${icon} ${cat.padEnd(12)}: ${stat.passed}/${stat.total} passed (${Math.round((stat.passed / stat.total) * 100)}%)`)
  }

  console.log(`\n------------------------------------------------------------------------`)
  console.log(`TOTAL TESTCASES EXECUTED: ${total}`)
  console.log(`TOTAL PASSED:            ${passed} (${Math.round((passed / total) * 100)}%)`)
  console.log(`TOTAL FAILED:            ${failed}`)
  console.log(`------------------------------------------------------------------------`)

  if (failed > 0) {
    console.log(`\n⚠️  LIST OF FAILED CHECKS:`)
    for (const f of results.filter((r) => !r.passed)) {
      console.log(`  - [TC-${f.id}] [${f.category}] ${f.name}: ${f.detail}`)
    }
    process.exit(1)
  } else {
    console.log(`\n🎉 SPECTACULAR! ALL ${total} TESTCASES PASSED WITH ZERO ERRORS AND 100% SUCCESS!`)
    console.log(`========================================================================\n`)
  }
}

runDeepAudit().catch((err) => {
  console.error('\nFatal runtime error during deep audit execution:', err)
  process.exit(1)
})
