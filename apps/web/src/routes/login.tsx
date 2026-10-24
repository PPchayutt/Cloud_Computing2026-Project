import { useForm } from '@tanstack/react-form'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { BrandMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { authClient } from '@/lib/auth'

export const Route = createFileRoute('/login')({ component: LoginPage })

const DEMO_PERSONAS = [
  {
    role: 'Organizer',
    name: 'Somchai Pattana',
    email: 'somchai@eventide.test',
    subtitle: 'Manage & create events',
  },
  {
    role: 'Attendee',
    name: 'Priya Sharma',
    email: 'priya@eventide.test',
    subtitle: 'Book tickets & checkout',
  },
  {
    role: 'Admin',
    name: 'Eventide Admin',
    email: 'admin@eventide.test',
    subtitle: 'Moderate users & events',
  },
] as const

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState('')
  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
      setError('')
      const result =
        mode === 'sign-in'
          ? await authClient.signIn.email({ email: value.email.trim(), password: value.password })
          : await authClient.signUp.email({ ...value, email: value.email.trim() })
      if (result.error) setError(result.error.message ?? 'Authentication failed')
      else await navigate({ to: '/' })
    },
  })
  return (
    <div className="relative flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center gap-6 overflow-hidden px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <BrandMark size="lg" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'sign-in' ? 'Welcome back' : 'Create an account'}</CardTitle>
          <CardDescription>
            {mode === 'sign-in'
              ? 'Sign in to access your tickets, orders, or organizer tools.'
              : 'Sign up to register for upcoming events.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form
            id="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              {mode === 'sign-up' ? (
                <form.Field
                  name="name"
                  validators={{
                    onChange: ({ value }) =>
                      value.trim().length < 2 ? 'Enter your name' : undefined,
                  }}
                >
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={!field.state.meta.isValid}
                      />
                      <FieldError
                        errors={field.state.meta.errors.map((message) => ({ message }))}
                      />
                    </Field>
                  )}
                </form.Field>
              ) : null}
              <form.Field
                name="email"
                validators={{
                  onChange: ({ value }) =>
                    value.includes('@') ? undefined : 'Enter a valid email',
                }}
              >
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      type="email"
                      placeholder="e.g. somchai@eventide.test"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={!field.state.meta.isValid}
                    />
                    <FieldError errors={field.state.meta.errors.map((message) => ({ message }))} />
                  </Field>
                )}
              </form.Field>
              <form.Field
                name="password"
                validators={{
                  onChange: ({ value }) =>
                    value.length >= 8 ? undefined : 'Use at least 8 characters',
                }}
              >
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <Input
                      id={field.name}
                      type="password"
                      placeholder="••••••••"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={!field.state.meta.isValid}
                    />
                    <FieldError errors={field.state.meta.errors.map((message) => ({ message }))} />
                  </Field>
                )}
              </form.Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </form>

          {mode === 'sign-in' ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Demo Accounts
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  seed-password-123
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {DEMO_PERSONAS.map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => {
                      form.setFieldValue('email', p.email)
                      form.setFieldValue('password', 'seed-password-123')
                      setError('')
                    }}
                    className="flex flex-col items-center justify-center rounded-lg border border-border/80 bg-background/90 p-2 text-center transition-all hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title={`Click to fill: ${p.email} (${p.subtitle})`}
                  >
                    <span className="text-xs font-semibold">{p.role}</span>
                    <span className="w-full truncate text-[10px] text-muted-foreground">
                      {p.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, submitting]) => (
              <Button
                form="auth-form"
                type="submit"
                className="w-full"
                disabled={!canSubmit || submitting}
              >
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {mode === 'sign-in' ? 'Log in' : 'Sign up'}
              </Button>
            )}
          </form.Subscribe>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          >
            {mode === 'sign-in' ? 'Need an account? Sign up' : 'Already registered? Log in'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
