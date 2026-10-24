/**
 * Fix covers for events without images and clean up temporary test events.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://eventide-ingress-7b5f0ef620246763.elb.us-east-1.amazonaws.com'
const PASSWORD = 'seed-password-123'

async function run() {
  console.log(`🔑 Signing in as Somchai...`)
  const loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'somchai@eventide.test', password: PASSWORD }),
  })
  const sessionToken = loginRes.headers.get('set-auth-token')
  if (!sessionToken) throw new Error('Could not sign in as Somchai')

  const jwtRes = await fetch(`${BASE_URL}/api/auth/token`, {
    headers: { authorization: `Bearer ${sessionToken}` },
  })
  const jwt = ((await jwtRes.json()) as { token: string }).token

  console.log(`📋 Fetching events list...`)
  const eventsRes = await fetch(`${BASE_URL}/api/events?page=1&pageSize=100`)
  const { items } = (await eventsRes.json()) as { items: any[] }

  const thumbnailBytes = await Bun.file('packages/db/assets/eventide-seed-thumbnail.webp').arrayBuffer()

  for (const ev of items) {
    // 1. Clean up temporary test events
    if (ev.title.startsWith('Flash Sale') || ev.title.startsWith('Somchai Private Conference')) {
      console.log(`🧹 Closing test event: "${ev.title}" (${ev.id})...`)
      await fetch(`${BASE_URL}/api/events/${ev.id}/close`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}` },
      })
      continue
    }

    // 2. If event has no cover image, upload thumbnail
    if (!ev.coverUrl) {
      console.log(`🖼️ Uploading cover thumbnail for: "${ev.title}" (${ev.id})...`)
      const presignRes = await fetch(`${BASE_URL}/api/events/${ev.id}/images/presign`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contentType: 'image/webp',
          altText: `${ev.title} cover`,
        }),
      })

      if (presignRes.ok) {
        const { uploadUrl } = (await presignRes.json()) as { uploadUrl: string }
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'image/webp' },
          body: thumbnailBytes,
        })
        if (uploadRes.ok) {
          console.log(`  ✓ Uploaded cover for "${ev.title}" successfully!`)
        } else {
          console.error(`  ✗ Upload failed: ${uploadRes.status}`)
        }
      } else {
        console.error(`  ✗ Presign failed: ${presignRes.status} ${await presignRes.text()}`)
      }
    }
  }

  console.log(`\n🎉 Cleanup and thumbnail check complete!`)
}

run().catch(console.error)
