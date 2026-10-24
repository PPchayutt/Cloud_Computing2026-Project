import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Calendar, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { EventThumbnail } from '@/components/event-thumbnail'
import { SiteFooter } from '@/components/site-footer'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { authClient } from '@/lib/auth'
import { edenEvent, edenPayment, edenReg } from '@/lib/eden'
import { eventQuery } from '@/lib/queries'

export const Route = createFileRoute('/events/$eventId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(eventQuery(params.eventId)),
  component: EventPage,
})

function EventPage() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const { data: event } = useSuspenseQuery(eventQuery(eventId))
  const isOwner = session?.user?.id === event.ownerId || (session?.user as any)?.role === 'admin'

  const publishMutation = useMutation({
    mutationFn: async () => {
      const result = await edenEvent.api.events({ id: eventId }).publish.post()
      if (result.error) throw new Error('Unable to publish event. Ensure total ticket quota is within capacity.')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event published successfully!')
    },
    onError: (err) => toast.error(err.message),
  })

  const mutation = useMutation({
    mutationFn: async (value: { ticketTypeId: string; quantity: number }) => {
      const orderResult = await edenReg.api.orders.post(
        { eventId, items: [value] },
        { headers: { 'idempotency-key': crypto.randomUUID() } },
      )
      if (orderResult.error || !orderResult.data) {
        const errVal = (orderResult.error as any)?.value
        const msg =
          (typeof errVal === 'object' && errVal?.message) ||
          (typeof errVal === 'string' && errVal) ||
          'Reservation failed. The tickets may be unavailable or sold out.'
        throw new Error(msg)
      }
      const paymentResult = await edenPayment.api.payments.checkout.post(
        { orderId: orderResult.data.id },
        { headers: { 'idempotency-key': crypto.randomUUID() } },
      )
      if (paymentResult.error || !paymentResult.data) {
        const errVal = (paymentResult.error as any)?.value
        const msg =
          (typeof errVal === 'object' && errVal?.message) ||
          (typeof errVal === 'string' && errVal) ||
          'Payment failed. Please try again.'
        throw new Error(msg)
      }
      return paymentResult.data
    },
    onSuccess: async (payment) => {
      toast.success(
        payment.status === 'SUCCEEDED' ? 'Payment complete' : 'Payment is being verified',
      )
      await navigate({ to: '/tickets' })
    },
    onError: (error) => toast.error(error.message),
  })

  const first = event.ticketTypes[0]
  const form = useForm({
    defaultValues: { ticketTypeId: first?.id ?? '', quantity: 1 },
    onSubmit: ({ value }) => mutation.mutateAsync(value),
  })

  const now = new Date()
  const salesStart = new Date(event.salesStartAt)
  const salesEnd = new Date(event.salesEndAt)
  const isSalesNotStarted = now < salesStart
  const isSalesEnded = now > salesEnd
  const isPublished = event.status === 'PUBLISHED'
  const canReserve = isPublished && !isSalesNotStarted && !isSalesEnded && Boolean(first)

  let buttonText = 'Reserve and pay now'
  if (mutation.isPending) {
    buttonText = 'Processing…'
  } else if (event.status === 'CLOSED') {
    buttonText = 'Event is closed'
  } else if (event.status === 'SUSPENDED') {
    buttonText = 'Event is suspended'
  } else if (event.status === 'DRAFT') {
    buttonText = 'Event is in draft'
  } else if (isSalesNotStarted) {
    buttonText = 'Sales have not started yet'
  } else if (isSalesEnded) {
    buttonText = 'Ticket sales have ended'
  }

  const startDate = new Date(event.startsAt)
  const endDate = new Date(event.endsAt)
  const dateStr = startDate.toLocaleDateString('en-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium' })
  const startTimeStr = startDate.toLocaleTimeString('en-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
  const endTimeStr = endDate.toLocaleTimeString('en-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-1 flex-col">
      <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-10">
        {isOwner && event.status === 'DRAFT' ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-amber-950 dark:text-amber-200">
                This event is currently in Draft
              </p>
              <p className="text-sm text-amber-800/80 dark:text-amber-300/80">
                Attendees cannot see or register for this event until you publish it.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                {publishMutation.isPending ? 'Publishing…' : 'Publish event now'}
              </Button>
              <Button
                variant="outline"
                render={<Link to="/organizer/events/$eventId/edit" params={{ eventId: event.id }} />}
              >
                Edit event
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid flex-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
          <section className="flex flex-col gap-5">
            <EventThumbnail src={event.coverUrl} title={event.title} eager className="rounded-xl" />
            <div className="flex flex-wrap gap-2">
              <Badge variant={event.status === 'PUBLISHED' ? 'default' : event.status === 'SUSPENDED' ? 'destructive' : 'secondary'}>
                {event.status}
              </Badge>
              <Badge variant="secondary">Refund {event.refundPercent}%</Badge>
            </div>
            <h1 className="font-heading text-3xl font-black tracking-tight sm:text-4xl">
              {event.title}
            </h1>
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Calendar className="size-4 shrink-0" />
                {dateStr} · {startTimeStr} – {endTimeStr} (ICT)
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" />
                Thailand
              </p>
            </div>
            <p className="leading-7 whitespace-pre-line">{event.description}</p>
          </section>

          <Card className="lg:sticky lg:top-24 lg:self-start">
            <CardHeader>
              <CardTitle>Choose tickets</CardTitle>
              <CardDescription>Your reservation is held for eight minutes.</CardDescription>
            </CardHeader>
            <CardContent>
              {first ? (
                <form
                  id="checkout-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                  }}
                >
                  <FieldGroup>
                    <form.Field name="ticketTypeId">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>Ticket type</FieldLabel>
                          <Select
                            items={event.ticketTypes.map((type) => ({
                              value: type.id,
                              label: `${type.name} — ฿${type.price}`,
                            }))}
                            value={field.state.value}
                            onValueChange={(value) => field.handleChange(value ?? '')}
                          >
                            <SelectTrigger id={field.name}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {event.ticketTypes.map((type) => (
                                  <SelectItem key={type.id} value={type.id}>
                                    {type.name} — ฿{type.price}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                    <form.Field
                      name="quantity"
                      validators={{
                        onChange: ({ value }) =>
                          value > 0 && value <= 20 ? undefined : 'Choose 1–20 tickets',
                      }}
                    >
                      {(field) => (
                        <Field data-invalid={!field.state.meta.isValid}>
                          <FieldLabel htmlFor={field.name}>Quantity</FieldLabel>
                          <Input
                            id={field.name}
                            type="number"
                            min={1}
                            max={20}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                            aria-invalid={!field.state.meta.isValid}
                          />
                          <FieldError
                            errors={field.state.meta.errors.map((message) => ({ message }))}
                          />
                        </Field>
                      )}
                    </form.Field>

                    <form.Subscribe selector={(state) => [state.values.ticketTypeId, state.values.quantity] as const}>
                      {([typeId, qty]) => {
                        const selected = event.ticketTypes.find((t) => t.id === typeId) ?? first
                        const priceNum = selected ? Number(selected.price) : 0
                        const total = (priceNum * (qty || 1)).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                        return (
                          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                            <span className="text-muted-foreground">Estimated total:</span>
                            <span className="font-semibold text-foreground">฿{total}</span>
                          </div>
                        )
                      }}
                    </form.Subscribe>
                  </FieldGroup>
                </form>
              ) : (
                <p className="text-muted-foreground">Tickets are not available yet.</p>
              )}
            </CardContent>
            <CardFooter>
              {session ? (
                <Button
                  form="checkout-form"
                  type="submit"
                  className="w-full"
                  disabled={!canReserve || mutation.isPending}
                >
                  {buttonText}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => navigate({ to: '/login' })}
                >
                  Log in to reserve tickets
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
