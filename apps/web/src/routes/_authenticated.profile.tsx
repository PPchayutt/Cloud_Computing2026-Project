import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CheckCircle2, Clock, ShieldCheck, User as UserIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authApiFetch } from "@/lib/auth"

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage })

type UserProfile = {
  id: string
  name: string
  email: string
  role?: string
  organizerApprovalStatus: "NOT_APPLIED" | "PENDING" | "APPROVED"
  phone?: string | null
}

const FIELD_CONFIG = [
  { name: "displayName", label: "Display name / Organization", type: "text", placeholder: "e.g. Somchai Pattana" },
  { name: "contactEmail", label: "Contact email", type: "email", placeholder: "e.g. somchai@example.com" },
  { name: "contactPhone", label: "Contact phone number", type: "tel", placeholder: "e.g. 0812345678" },
] as const

function ProfilePage() {
  const queryClient = useQueryClient()
  const [errorMsg, setErrorMsg] = useState("")

  const { data: userProfile, isPending } = useQuery<UserProfile>({
    queryKey: ["users", "me"],
    queryFn: async () => {
      const res = await authApiFetch("/api/users/me")
      if (!res.ok) throw new Error("Could not load user profile")
      return res.json()
    },
  })

  const form = useForm({
    defaultValues: {
      displayName: userProfile?.name ?? "",
      contactEmail: userProfile?.email ?? "",
      contactPhone: userProfile?.phone ?? "",
    },
    onSubmit: async ({ value }) => {
      setErrorMsg("")
      const response = await authApiFetch("/api/users/me/organizer-application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      })
      if (response.ok) {
        toast.success("Organizer application submitted for review.")
        await queryClient.invalidateQueries({ queryKey: ["users", "me"] })
      } else {
        const data = await response.json().catch(() => ({}))
        const msg = data?.message || "Could not submit application. Please check your inputs."
        setErrorMsg(msg)
        toast.error(msg)
      }
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your Profile"
        description="Manage your account information and organizer access status."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <UserIcon className="size-5" />
              <CardTitle>Account Details</CardTitle>
            </div>
            <CardDescription>Basic account credentials and role assignments.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">Full Name</p>
              <p className="text-base font-medium">{userProfile?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">Email Address</p>
              <p className="text-base font-medium">{userProfile?.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wider">System Role</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={userProfile?.role === "admin" ? "destructive" : userProfile?.role === "organizer" ? "default" : "secondary"}>
                  {userProfile?.role?.toUpperCase() ?? "ATTENDEE"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {userProfile?.organizerApprovalStatus === "APPROVED" ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
                <CardTitle>Approved Organizer</CardTitle>
              </div>
              <CardDescription>
                You are a verified organizer on Eventide.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You have full access to create events, configure ticket tiers, upload media, view real-time sales summaries, and check in attendees at the gate.
              </p>
            </CardContent>
            <CardFooter>
              <Button render={<Link to="/organizer/events" />}>
                Go to Organizer Dashboard
              </Button>
            </CardFooter>
          </Card>
        ) : userProfile?.organizerApprovalStatus === "PENDING" ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Clock className="size-5" />
                <CardTitle>Application Under Review</CardTitle>
              </div>
              <CardDescription>
                Your organizer application has been received.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                An administrator is reviewing your application details. Once approved, you will be able to create and publish events immediately.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="size-5" />
                <CardTitle>Apply for Organizer Access</CardTitle>
              </div>
              <CardDescription>
                Submit contact details to create and manage events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                id="organizer-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void form.handleSubmit()
                }}
              >
                <FieldGroup>
                  {FIELD_CONFIG.map(({ name, label, type, placeholder }) => (
                    <form.Field key={name} name={name}>
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                          <Input
                            id={field.name}
                            type={type}
                            placeholder={placeholder}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                          <FieldError
                            errors={field.state.meta.errors.map((error) => ({ message: error }))}
                          />
                        </Field>
                      )}
                    </form.Field>
                  ))}
                  {errorMsg ? <FieldError>{errorMsg}</FieldError> : null}
                </FieldGroup>
              </form>
            </CardContent>
            <CardFooter>
              <Button form="organizer-form" type="submit">
                Submit Application
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  )
}
