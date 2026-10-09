import Image from "next/image";

export default function VerifyEmailLoading() {
  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Image
            src="/fleetora-logo.png"
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
            className="size-10 shrink-0 object-contain"
          />
          <span className="text-lg font-semibold leading-6 tracking-tight">
            Fleetora
          </span>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-12 sm:px-8">
        <div
          role="status"
          className="mx-auto w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-9"
        >
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-full bg-primary-subtle text-xl font-semibold text-primary"
          >
            …
          </span>
          <p className="mt-6 text-sm font-semibold text-primary">
            Account verification
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-8 tracking-tight">
            Checking your email
          </h1>
          <p className="mt-3 leading-6 text-muted-foreground">
            We’re securely checking your verification link.
          </p>
        </div>
      </section>
    </main>
  );
}
