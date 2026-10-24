import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateTimePicker } from '@/components/date-time-picker'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { edenEvent } from '@/lib/eden'
import {
  type CoverContentType,
  coverContentTypes,
  coverFileError,
  uploadEventCover,
} from '@/lib/event-cover'
import {
  bangkokDateTimeInputToIso,
  isDateTimeInput,
  toBangkokDateTimeInput,
} from '@/lib/event-dates'

const localTime = (offsetHours: number) => {
  const date = new Date(Date.now() + offsetHours * 3_600_000)
  return toBangkokDateTimeInput(date)
}

const textFields = [
  { name: 'title', label: 'Event title', type: 'text', placeholder: 'e.g. Bangkok Tech Conference' },
  { name: 'ticketName', label: 'Ticket name', type: 'text', placeholder: 'e.g. Early Bird' },
  { name: 'price', label: 'Price (THB)', type: 'text', placeholder: '500.00' },
] as const

const dateFields = [
  { name: 'startsAt', label: 'Starts' },
  { name: 'endsAt', label: 'Ends' },
  { name: 'salesStartAt', label: 'Sales start' },
  { name: 'salesEndAt', label: 'Sales end' },
] as const

export const Route = createFileRoute('/_organizer/organizer/events/new')({
  component: CreateEventPage,
})

function CreateEventPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [ticketReady, setTicketReady] = useState(false)
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const [shouldPublish, setShouldPublish] = useState(true)

  const finish = async (eventId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['events'] })
    await navigate({ to: '/events/$eventId', params: { eventId } })
  }

  const form = useForm({
    defaultValues: {
      title: '',
      description: '',
      startsAt: localTime(48),
      endsAt: localTime(51),
      salesStartAt: localTime(0),
      salesEndAt: localTime(47),
      capacity: 100,
      refundPercent: 100,
      ticketName: 'General admission',
      price: '500.00',
    },
    onSubmit: async ({ value }) => {
      setError('')
      setThumbnailFailed(false)

      const validationError = coverFileError(coverFile)
      if (validationError) return setError(validationError)

      let eventId = createdEventId
      if (!eventId) {
        const created = await edenEvent.api.events.post({
          title: value.title.trim(),
          description: value.description.trim(),
          startsAt: bangkokDateTimeInputToIso(value.startsAt),
          endsAt: bangkokDateTimeInputToIso(value.endsAt),
          salesStartAt: bangkokDateTimeInputToIso(value.salesStartAt),
          salesEndAt: bangkokDateTimeInputToIso(value.salesEndAt),
          capacity: value.capacity,
          refundPercent: value.refundPercent,
        })
        if (created.error || !created.data || created.data instanceof Response) {
          const errVal = (created.error as any)?.value
          const msg =
            (typeof errVal === 'object' && errVal?.message) ||
            (typeof errVal === 'string' && errVal) ||
            'Could not create event. Confirm organizer approval and dates.'
          return setError(msg)
        }
        eventId = created.data.id
        setCreatedEventId(eventId)
      }

      if (!ticketReady) {
        const ticket = await edenEvent.api['ticket-types'].post({
          eventId,
          name: value.ticketName.trim(),
          price: value.price.trim(),
          quota: value.capacity,
          maxPerOrder: 10,
          maxPerUser: 20,
        })
        if (ticket.error) {
          const errVal = (ticket.error as any)?.value
          const msg =
            (typeof errVal === 'object' && errVal?.message) ||
            (typeof errVal === 'string' && errVal) ||
            'The draft was saved, but its ticket type could not be created. Retry.'
          return setError(msg)
        }
        setTicketReady(true)
      }

      if (coverFile) {
        try {
          await uploadEventCover(coverFile, async (contentType: CoverContentType) => {
            const prepared = await edenEvent.api
              .events({ id: eventId })
              .images.presign.post({ contentType })
            if (prepared.error || !prepared.data || prepared.data instanceof Response) return null
            return prepared.data
          })
        } catch (uploadError) {
          setThumbnailFailed(true)
          return setError(
            `The draft and ticket type were saved. ${
              uploadError instanceof Error ? uploadError.message : 'The thumbnail upload failed.'
            }`,
          )
        }
      }

      if (shouldPublish) {
        const published = await edenEvent.api.events({ id: eventId }).publish.post()
        if (published.error) {
          toast.warning('Event saved as draft. You can publish it once ticket quotas match capacity.')
        } else {
          toast.success('Event created and published successfully!')
        }
      } else {
        toast.success('Event draft created successfully!')
      }

      await finish(eventId)
    },
  })
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create an event</CardTitle>
        <CardDescription>
          Fill in the details below. You can publish immediately to make it visible on the event catalog.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="event-form"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            {textFields.map(({ name, label, type, placeholder }) => (
              <form.Field
                key={name}
                name={name}
                validators={{
                  onChange: ({ value }) =>
                    String(value).trim() ? undefined : `${label} is required`,
                }}
              >
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                    <Input
                      id={field.name}
                      type={type}
                      placeholder={placeholder}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={!field.state.meta.isValid}
                    />
                    <FieldError errors={field.state.meta.errors.map((message) => ({ message }))} />
                  </Field>
                )}
              </form.Field>
            ))}
            <FieldSet>
              <FieldLegend>Schedule</FieldLegend>
              <FieldDescription>Dates and times use Bangkok time (ICT).</FieldDescription>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                {dateFields.map(({ name, label }) => (
                  <form.Field
                    key={name}
                    name={name}
                    validators={{
                      onChange: ({ value }) =>
                        isDateTimeInput(value) ? undefined : `${label} is required`,
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                        <DateTimePicker
                          id={field.name}
                          label={label}
                          value={field.state.value}
                          required
                          invalid={!field.state.meta.isValid}
                          onBlur={field.handleBlur}
                          onChange={field.handleChange}
                        />
                        <FieldError
                          errors={field.state.meta.errors.map((message) => ({ message }))}
                        />
                      </Field>
                    )}
                  </form.Field>
                ))}
              </FieldGroup>
            </FieldSet>
            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Textarea
                    id={field.name}
                    placeholder="Describe your event agenda, speakers, venue, or admission guidelines..."
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="capacity">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Capacity</FieldLabel>
                  <Input
                    id={field.name}
                    type="number"
                    min={1}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  />
                </Field>
              )}
            </form.Field>
            <Field data-invalid={Boolean(coverFileError(coverFile))}>
              <FieldLabel htmlFor="cover">Event thumbnail</FieldLabel>
              <Input
                id="cover"
                type="file"
                accept={coverContentTypes.join(',')}
                onChange={(event) => {
                  setCoverFile(event.target.files?.[0] ?? null)
                  setThumbnailFailed(false)
                  setError('')
                }}
                aria-invalid={Boolean(coverFileError(coverFile))}
              />
              <p className="text-sm text-muted-foreground">Optional JPEG, PNG, or WebP cover.</p>
            </Field>

            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3.5">
              <input
                id="should-publish"
                type="checkbox"
                checked={shouldPublish}
                onChange={(e) => setShouldPublish(e.target.checked)}
                className="size-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
              />
              <div className="flex flex-col">
                <label htmlFor="should-publish" className="text-sm font-medium leading-none cursor-pointer">
                  Publish event immediately
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, this event will immediately be live and visible in the public event catalog for registration.
                </p>
              </div>
            </div>

            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="gap-3">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button form="event-form" type="submit" disabled={submitting}>
              {submitting
                ? 'Saving…'
                : createdEventId
                  ? ticketReady
                    ? 'Retry thumbnail upload'
                    : 'Retry ticket type'
                  : shouldPublish
                    ? 'Create & Publish'
                    : 'Save as draft'}
            </Button>
          )}
        </form.Subscribe>
        {thumbnailFailed && createdEventId ? (
          <Button variant="outline" onClick={() => void finish(createdEventId)}>
            Continue without thumbnail
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  )
}
