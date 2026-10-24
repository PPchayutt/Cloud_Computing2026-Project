import { Link } from "@tanstack/react-router"
import { BrandMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import { authClient } from "@/lib/auth"

export function SiteHeader() {
  const { data: session } = authClient.useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" render={<Link to="/events" />}>
              Events
            </Button>
            {role === "organizer" || role === "admin" ? (
              <Button variant="ghost" size="sm" render={<Link to="/organizer/events" />}>
                Organizer
              </Button>
            ) : (
              <Button variant="ghost" size="sm" render={<Link to="/profile" />}>
                Become an organizer
              </Button>
            )}
            {role === "admin" ? (
              <Button variant="ghost" size="sm" render={<Link to="/admin/users" />}>
                Admin
              </Button>
            ) : null}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
