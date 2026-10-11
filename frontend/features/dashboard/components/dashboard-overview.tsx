import type { SessionUser } from "@/features/auth/login.types";

export function DashboardOverview({ user }: { user: SessionUser }) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <section aria-labelledby="overview-welcome-title" className="max-w-3xl">
        <h2 id="overview-welcome-title" className="break-words text-2xl font-semibold leading-8 tracking-tight sm:text-3xl sm:leading-9">
          Welcome to Fleetora
        </h2>
        {user.company ? (
          <p className="mt-3 max-w-xl break-words text-sm leading-6 text-muted-foreground">
            Your company workspace is active.
          </p>
        ) : (
          <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-muted-foreground">
            You’re signed in as a Fleetora platform administrator. This workspace isn’t associated with a company.
          </p>
        )}
      </section>

    </div>
  );
}
