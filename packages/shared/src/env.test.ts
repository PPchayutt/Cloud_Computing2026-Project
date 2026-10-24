import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { defineEnv } from './env.ts'

describe('defineEnv', () => {
  it('parses and coerces from process.env', () => {
    process.env.SHARED_TEST_PORT = '8080'
    const env = defineEnv(z.object({ SHARED_TEST_PORT: z.coerce.number() }))
    expect(env.SHARED_TEST_PORT).toBe(8080)
  })

  it('throws a readable error when a var is missing', () => {
    expect(() => defineEnv(z.object({ SHARED_TEST_MISSING: z.string() }))).toThrow(
      /SHARED_TEST_MISSING/,
    )
  })

  it('strips carriage returns and whitespace from string env vars', () => {
    process.env.SHARED_TEST_CR = 'secret-value\r'
    const env = defineEnv(z.object({ SHARED_TEST_CR: z.string() }))
    expect(env.SHARED_TEST_CR).toBe('secret-value')
  })
})
