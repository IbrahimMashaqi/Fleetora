"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { SessionGate } from "@/features/auth/session/session-gate";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { LogoutControl } from "@/features/auth/logout/logout-control";
import { notifySessionChange } from "@/features/auth/session/session-events";
import { withSessionLock } from "@/lib/auth/session-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";
import {
  isPlatformMe,
  isPlatformOverview,
  platformRoles,
  isPlatformRole,
  record,
  type PlatformMe,
  type PlatformMember,
  type PlatformOverview,
  type PlatformOperation,
} from "./platform-contract";

export function PlatformConsole() {
  const { locale } = useLocale();
  return (
    <SessionGate loginPath="/platform/login">
      {(user) =>
        user.role === "PLATFORM_ADMIN" ? (
          <Console key={user.id} />
        ) : (
          <main className="mx-auto max-w-xl p-8">
            <p role="alert">
              {locale === "ar"
                ? "يلزم حساب منصة Fleetora للوصول."
                : "Platform access required"}
            </p>
            <Link href="/app">
              {locale === "ar" ? "العودة إلى الشركة" : "Back to company"}
            </Link>
          </main>
        )
      }
    </SessionGate>
  );
}
function Console() {
  const { user } = useProtectedSession();
  const { locale } = useLocale();
  const c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [identity, setIdentity] = useState<PlatformMe | null>(null);
  const [team, setTeam] = useState<PlatformOverview | null>(null);
  const [audit, setAudit] = useState<
    { id: string; action: string; createdAt: string }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activationUrl, setActivationUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const mounted = useRef(true);
  const request = useCallback(
    async (operation: PlatformOperation) => {
      return withSessionLock(async () => {
        try {
          const response = await fetch("/api/platform", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...operation, userId: user.id }),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(20000),
          });
          const result: unknown = await response.json();
          if (response.status === 401) notifySessionChange();
          return record(result) ? result : { status: "unavailable" };
        } catch {
          return { status: "unavailable" };
        }
      });
    },
    [user.id],
  );
  const refresh = useCallback(
    () =>
      request({ action: "me" }).then(async (result) => {
        if (!mounted.current) return;
        if (result.status !== "ready" || !isPlatformMe(result.data)) {
          setIdentity(null);
          setTeam(null);
          setAudit([]);
          setError(String(result.status));
          return;
        }
        setIdentity(result.data);
        setError("");
        if (result.data.role === "SUPER_ADMIN") {
          const [staff, events] = await Promise.all([
            request({ action: "staff" }),
            request({ action: "audit" }),
          ]);
          if (!mounted.current) return;
          if (staff.status === "ready" && isPlatformOverview(staff.data))
            setTeam(staff.data);
          else {
            setTeam(null);
            setError(String(staff.status));
          }
          if (
            events.status === "ready" &&
            record(events.data) &&
            Array.isArray(events.data.items)
          ) {
            setAudit(
              events.data.items.flatMap((item) =>
                record(item) &&
                typeof item.id === "string" &&
                typeof item.action === "string" &&
                typeof item.createdAt === "string"
                  ? [
                      {
                        id: item.id,
                        action: item.action,
                        createdAt: item.createdAt,
                      },
                    ]
                  : [],
              ),
            );
          }
        } else {
          setTeam(null);
          setAudit([]);
        }
      }),
    [request],
  );
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const recheck = () => {
      void refresh();
    };
    window.addEventListener("focus", recheck);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", recheck);
    };
  }, [refresh]);
  function roleName(role: string) {
    const names: Record<string, [string, string]> = {
      SUPER_ADMIN: ["Super Admin", "المسؤول الأعلى"],
      COMPANY_MANAGER: ["Company manager", "مدير الشركات"],
      BILLING: ["Billing", "الفوترة"],
      SUPPORT: ["Support (read-only)", "الدعم (قراءة فقط)"],
    };
    return names[role]?.[locale === "ar" ? 1 : 0] ?? role;
  }
  function failure(status: string) {
    if (status === "last-admin")
      return c(
        "Keep at least one active Super Admin.",
        "يجب الإبقاء على مسؤول أعلى نشط واحد على الأقل.",
      );
    if (status === "email-in-use")
      return c(
        "An account already uses this email.",
        "يوجد حساب يستخدم هذا البريد الإلكتروني بالفعل.",
      );
    if (status === "forbidden")
      return c(
        "You don't have permission for this platform action.",
        "ليس لديك إذن لتنفيذ هذا الإجراء في المنصة.",
      );
    if (status === "invalid")
      return c(
        "Check the email and role, then try again.",
        "تحقق من البريد والدور ثم حاول مجدداً.",
      );
    if (status === "changed" || status === "unauthenticated")
      return c(
        "Your session changed. Sign in again.",
        "تغيّرت جلستك. سجّل الدخول مجدداً.",
      );
    if (status === "conflict" || status === "not-found")
      return c(
        "This record changed. Refresh before trying again.",
        "تغيّر السجل. حدّث البيانات قبل المحاولة مجدداً.",
      );
    return c(
      "We could not confirm the operation. Refresh before trying again.",
      "تعذّر تأكيد الإجراء. حدّث البيانات قبل المحاولة مجدداً.",
    );
  }
  const mutationLocked = useRef(false);
  async function mutate(operation: PlatformOperation) {
    if (mutationLocked.current) return false;
    mutationLocked.current = true;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await request(operation);
      if (!mounted.current) return false;
      if (result.status !== "ready") {
        setError(String(result.status));
        return false;
      }
      if (operation.action === "invite") {
        if (
          !record(result.data) ||
          typeof result.data.activationUrl !== "string"
        ) {
          setError("unavailable");
          return false;
        }
        setActivationUrl(result.data.activationUrl);
        setManual(result.data.delivery === "MANUAL");
      }
      await refresh();
      return true;
    } finally {
      mutationLocked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const role = values.get("role");
    if (!isPlatformRole(role)) return;
    if (
      await mutate({
        action: "invite",
        email: String(values.get("email") ?? ""),
        role,
      })
    )
      form.reset();
  }
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-sidebar-navy px-4 py-4 text-sidebar-foreground sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/platform" className="text-lg font-semibold text-primary">
            Fleetora
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <LogoutControl />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            {c("Fleetora platform", "إدارة منصة Fleetora")}
          </h1>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setActivationUrl("");
              void refresh();
            }}
          >
            {c("Refresh", "تحديث")}
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-background p-4"
          >
            {failure(error)}
          </p>
        )}
        {!identity && !error && (
          <p role="status">
            {c("Loading platform access…", "جارٍ تحميل صلاحيات المنصة…")}
          </p>
        )}
        {identity && (
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="font-semibold">{identity.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {roleName(identity.role)}
            </p>
            <p className="mt-3 text-sm">
              {c(
                "Platform access does not grant access to company operations.",
                "صلاحيات المنصة لا تمنح وصولاً إلى عمليات الشركات.",
              )}
            </p>
          </section>
        )}
        {identity?.role === "SUPER_ADMIN" && (
          <>
            <section className="rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-4 text-lg font-semibold">
                {c("Invite platform staff", "دعوة موظف للمنصة")}
              </h2>
              <form
                onSubmit={invite}
                className="flex flex-wrap items-end gap-4"
              >
                <fieldset disabled={busy} className="contents">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="platform-email">
                      {c("Email", "البريد الإلكتروني")}
                    </Label>
                    <Input
                      id="platform-email"
                      name="email"
                      type="email"
                      dir="ltr"
                      autoComplete="email"
                      required
                      maxLength={254}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform-role">
                      {c("Platform role", "دور المنصة")}
                    </Label>
                    <select
                      id="platform-role"
                      name="role"
                      defaultValue="SUPPORT"
                      className="h-10 rounded-md border border-border bg-surface px-3"
                    >
                      {platformRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleName(role)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit">
                    {c("Send invitation", "إرسال دعوة")}
                  </Button>
                </fieldset>
              </form>
              {activationUrl && (
                <div role="status" className="mt-4 space-y-3">
                  <p>
                    {manual
                      ? c(
                          "Email could not be delivered. Share the activation link securely.",
                          "تعذّر إرسال البريد. شارك رابط التفعيل بأمان.",
                        )
                      : c("Invitation emailed.", "أُرسلت الدعوة بالبريد.")}
                  </p>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(activationUrl);
                        setCopied(true);
                      } catch {
                        setError("unavailable");
                      }
                    }}
                  >
                    {c("Copy activation link", "نسخ رابط التفعيل")}
                  </Button>
                  {copied && <p>{c("Link copied.", "نُسخ الرابط.")}</p>}
                </div>
              )}
            </section>
            <section className="rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-4 text-lg font-semibold">
                {c("Platform staff", "فريق المنصة")}
              </h2>
              {team ? (
                <div className="space-y-4">
                  {team.members.map((member) => (
                    <Member
                      key={`${member.id}:${member.role}:${member.active}`}
                      member={member}
                      busy={busy}
                      save={mutate}
                      roleName={roleName}
                    />
                  ))}
                </div>
              ) : (
                <p role="status">{c("Loading staff…", "جارٍ تحميل الفريق…")}</p>
              )}
            </section>
            {team && (
              <section className="rounded-lg border border-border bg-surface p-5">
                <h2 className="mb-4 text-lg font-semibold">
                  {c("Invitations", "الدعوات")}
                </h2>
                {team.invitations.length === 0 && (
                  <p>{c("No invitations.", "لا توجد دعوات.")}</p>
                )}
                <ul className="space-y-3">
                  {team.invitations.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
                    >
                      <div>
                        <bdi dir="ltr">{invite.email}</bdi>
                        <p className="text-sm text-muted-foreground">
                          {roleName(invite.role)} ·{" "}
                          {c(
                            {
                              PENDING: "Pending",
                              ACCEPTED: "Accepted",
                              REVOKED: "Revoked",
                              EXPIRED: "Expired",
                            }[invite.state] ?? invite.state,
                            {
                              PENDING: "قيد الانتظار",
                              ACCEPTED: "مقبولة",
                              REVOKED: "ملغاة",
                              EXPIRED: "منتهية",
                            }[invite.state] ?? invite.state,
                          )}
                        </p>
                      </div>
                      {["PENDING", "EXPIRED"].includes(invite.state) && (
                        <Button
                          disabled={busy}
                          variant="outline"
                          onClick={() => {
                            void mutate({ action: "revoke", id: invite.id });
                          }}
                        >
                          {c("Revoke invitation", "إلغاء الدعوة")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-4 text-lg font-semibold">
                {c("Recent access changes", "آخر تغييرات الصلاحيات")}
              </h2>
              <ul className="space-y-2">
                {audit.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap justify-between gap-3 text-sm"
                  >
                    <span>
                      {c(
                        event.action.includes("ACCEPTED")
                          ? "Account activated"
                          : event.action.includes("REVOKED")
                            ? "Invitation revoked"
                            : event.action.includes("CHANGED")
                              ? "Staff access changed"
                              : "Invitation issued",
                        event.action.includes("ACCEPTED")
                          ? "تفعيل حساب"
                          : event.action.includes("REVOKED")
                            ? "إلغاء دعوة"
                            : event.action.includes("CHANGED")
                              ? "تغيير صلاحيات موظف"
                              : "إصدار دعوة",
                      )}
                    </span>
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString(locale)}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
function Member({
  member,
  busy,
  save,
  roleName,
}: {
  member: PlatformMember;
  busy: boolean;
  save: (operation: PlatformOperation) => Promise<boolean>;
  roleName: (role: string) => string;
}) {
  const { locale } = useLocale();
  const c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [role, setRole] = useState(member.role),
    [active, setActive] = useState(member.active);
  return (
    <form
      aria-label={member.name}
      className="flex flex-wrap items-end gap-4 rounded-md border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save({ action: "update", id: member.id, role, active });
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{member.name}</p>
        <bdi dir="ltr" className="text-sm text-muted-foreground">
          {member.email}
        </bdi>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`role-${member.id}`}>
          {c("Platform role", "دور المنصة")}
        </Label>
        <select
          id={`role-${member.id}`}
          className="h-10 rounded-md border border-border bg-surface px-3"
          disabled={busy}
          value={role}
          onChange={(event) => {
            if (isPlatformRole(event.target.value)) setRole(event.target.value);
          }}
        >
          {platformRoles.map((role) => (
            <option key={role} value={role}>
              {roleName(role)}
            </option>
          ))}
        </select>
      </div>
      <Label className="flex min-h-10 items-center gap-2">
        <input
          type="checkbox"
          checked={active}
          disabled={busy}
          onChange={(event) => setActive(event.target.checked)}
        />
        {c("Active", "نشط")}
      </Label>
      <Button
        type="submit"
        disabled={busy || (role === member.role && active === member.active)}
      >
        {c("Save changes", "حفظ التغييرات")}
      </Button>
    </form>
  );
}
