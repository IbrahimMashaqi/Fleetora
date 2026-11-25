"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { unstable_rethrow } from "next/navigation";
import { CircleAlert, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { DriverAccessDenied } from "@/features/drivers/components/driver-feedback";
import { withSessionLock } from "@/lib/auth/session-lock";
import { useLocale } from "@/lib/i18n";
import { readStaffAction, writeStaffAction } from "../staff.action";
import {
  staffRoles,
  type StaffInvitation,
  type StaffReadResult,
  type StaffRole,
  type StaffScope,
  type StaffWriteFailure,
} from "../staff.types";

const words = {
  en: {
    title: "Team",
    intro: "Invite accountants and additional administrators to your company workspace.",
    refresh: "Refresh",
    inviteTitle: "Invite a team member",
    inviteIntro: "The invited person sets their own name and password when they open the activation link.",
    email: "Email",
    role: "Role",
    COMPANY_ADMIN: "Company administrator",
    ACCOUNTANT: "Accountant",
    roleHelp: {
      ACCOUNTANT: "Finance access: parcels, collections, remittances and merchant settlements. Cannot manage staff, fleet or approve settlements.",
      COMPANY_ADMIN: "Full access to this company, including inviting and revoking staff.",
    },
    issue: "Create invitation",
    working: "Working…",
    manual: "Share this invitation securely",
    warning: "No email was sent. Deliver this link directly to the invited person through a trusted channel. Anyone with it can activate a new account for the invited email.",
    once: "The link appears only here. Copy it before dismissing this panel.",
    link: "Activation link",
    copyLink: "Copy link",
    copied: "Copied",
    copyFailed: "Copy failed. Select the field and copy it manually.",
    dismiss: "Dismiss invitation link",
    membersTitle: "Members",
    inactive: "Inactive",
    you: "You",
    noEmail: "No email",
    invitationsTitle: "Invitations",
    empty: "No invitations yet.",
    loading: "Loading team…",
    PENDING: "Pending",
    ACCEPTED: "Accepted",
    EXPIRED: "Expired",
    REVOKED: "Revoked",
    expires: "Expires",
    revoke: "Revoke",
    revokeLabel: "Revoke invitation for {email}",
    revokedSuccess: "Invitation revoked.",
    loadingFailed: "The team could not be loaded. Try again.",
    changed: "Your company session changed. Reload the page before continuing.",
    invalid: "Check the email address and role, then try again.",
    "not-found": "This invitation is no longer available. Refresh the list.",
    conflict: "An account already uses this email, or the invitation changed. Refresh the list.",
    uncertain: "The result could not be confirmed. Refresh the list before trying again.",
    unavailable: "The team service is unavailable right now. Try again.",
    forbidden: "Only company administrators can manage the team.",
    unauthenticated: "Your session ended. Sign in again.",
    reload: "Reload page",
  },
  ar: {
    title: "الفريق",
    intro: "ادعُ المحاسبين ومسؤولين إضافيين إلى مساحة عمل شركتك.",
    refresh: "تحديث",
    inviteTitle: "دعوة عضو إلى الفريق",
    inviteIntro: "يختار الشخص المدعو اسمه وكلمة المرور عند فتح رابط التفعيل.",
    email: "البريد الإلكتروني",
    role: "الدور",
    COMPANY_ADMIN: "مسؤول الشركة",
    ACCOUNTANT: "محاسب",
    roleHelp: {
      ACCOUNTANT: "صلاحيات مالية: الطرود والتحصيل والتوريد وتسويات التجار. لا يستطيع إدارة الفريق أو الأسطول أو اعتماد التسويات.",
      COMPANY_ADMIN: "صلاحيات كاملة على هذه الشركة، بما فيها دعوة الموظفين وإلغاء دعواتهم.",
    },
    issue: "إنشاء الدعوة",
    working: "جارٍ التنفيذ…",
    manual: "شارك هذه الدعوة بأمان",
    warning: "لم يُرسل بريد إلكتروني. سلّم الرابط مباشرة إلى الشخص المدعو عبر قناة موثوقة. من يملك الرابط يستطيع تفعيل حساب جديد للبريد المدعو.",
    once: "يظهر الرابط هنا فقط. انسخه قبل إخفاء هذه اللوحة.",
    link: "رابط التفعيل",
    copyLink: "نسخ الرابط",
    copied: "تم النسخ",
    copyFailed: "تعذر النسخ. حدد النص وانسخه يدوياً.",
    dismiss: "إخفاء رابط الدعوة",
    membersTitle: "الأعضاء",
    inactive: "غير نشط",
    you: "أنت",
    noEmail: "بلا بريد",
    invitationsTitle: "الدعوات",
    empty: "لا توجد دعوات بعد.",
    loading: "جارٍ تحميل الفريق…",
    PENDING: "قيد الانتظار",
    ACCEPTED: "مقبولة",
    EXPIRED: "منتهية",
    REVOKED: "ملغاة",
    expires: "تنتهي",
    revoke: "إلغاء",
    revokeLabel: "إلغاء دعوة {email}",
    revokedSuccess: "تم إلغاء الدعوة.",
    loadingFailed: "تعذر تحميل الفريق. حاول مجدداً.",
    changed: "تغيرت جلسة الشركة. أعد تحميل الصفحة قبل المتابعة.",
    invalid: "تحقق من البريد الإلكتروني والدور ثم حاول مجدداً.",
    "not-found": "هذه الدعوة لم تعد متاحة. حدّث القائمة.",
    conflict: "يوجد حساب بهذا البريد بالفعل أو تغيرت الدعوة. حدّث القائمة.",
    uncertain: "تعذر تأكيد النتيجة. حدّث القائمة قبل المحاولة مجدداً.",
    unavailable: "خدمة الفريق غير متاحة حالياً. حاول مجدداً.",
    forbidden: "إدارة الفريق متاحة لمسؤولي الشركة فقط.",
    unauthenticated: "انتهت جلستك. سجّل الدخول مجدداً.",
    reload: "إعادة تحميل الصفحة",
  },
};
type Copy = (typeof words)["en"];

const controlStyle =
  "min-h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function StaffDirectory() {
  const { user } = useProtectedSession();
  if (user.role !== "COMPANY_ADMIN" || !user.company || !user.orgId)
    return <DriverAccessDenied />;
  return (
    <TeamWorkspace
      key={`${user.id}:${user.orgId}`}
      scope={{ userId: user.id, companyId: user.orgId }}
    />
  );
}

function TeamWorkspace({ scope }: { scope: StaffScope }) {
  const { locale } = useLocale();
  const copy = words[locale];
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    attempt: number;
    result: StaffReadResult;
  }>();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("ACCOUNTANT");
  const [issued, setIssued] = useState<{ invitation: StaffInvitation; link: string }>();
  const [failure, setFailure] = useState<StaffWriteFailure>();
  const [feedback, setFeedback] = useState<"copied" | "copyFailed" | "revokedSuccess">();
  const [busy, startTransition] = useTransition();
  const [, startReadTransition] = useTransition();
  const result = response?.attempt === attempt ? response.result : undefined;
  const refresh = () => setAttempt((value) => value + 1);

  useEffect(() => {
    let active = true;
    startReadTransition(async () => {
      try {
        const result = await withSessionLock(() =>
          readStaffAction({ userId: scope.userId, companyId: scope.companyId }),
        );
        if (active) setResponse({ attempt, result });
      } catch (error) {
        unstable_rethrow(error);
        if (active) setResponse({ attempt, result: { status: "unavailable" } });
      }
    });
    return () => {
      active = false;
    };
  }, [attempt, scope.userId, scope.companyId]);

  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || issued) return;
    setFailure(undefined);
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await withSessionLock(() =>
          writeStaffAction(scope, { action: "issue", email, role }),
        );
        if (result.status === "issued") {
          setIssued({
            invitation: result.invitation,
            link: `${window.location.origin}/auth/accept-invitation#token=${result.token}`,
          });
          setEmail("");
          refresh();
        } else if (result.status !== "revoked") setFailure(result.status);
      } catch (error) {
        unstable_rethrow(error);
        setFailure("uncertain");
      }
    });
  }

  function revoke(invitationId: string) {
    if (busy) return;
    setFailure(undefined);
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await withSessionLock(() =>
          writeStaffAction(scope, { action: "revoke", id: invitationId }),
        );
        if (result.status === "revoked") {
          if (issued?.invitation.id === invitationId) setIssued(undefined);
          setFeedback("revokedSuccess");
          refresh();
        } else if (result.status !== "issued") setFailure(result.status);
      } catch (error) {
        unstable_rethrow(error);
        setFailure("uncertain");
      }
    });
  }

  async function copyLink(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("copied");
    } catch {
      setFeedback("copyFailed");
    }
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{copy.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.intro}</p>
        </div>
        <Button type="button" variant="ghost" disabled={!result || busy} onClick={refresh}>
          <RefreshCw aria-hidden="true" />
          {copy.refresh}
        </Button>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          aria-labelledby={`${id}-invite`}
          className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-6"
        >
          <h3 id={`${id}-invite`} className="font-semibold">{copy.inviteTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.inviteIntro}</p>
          <form onSubmit={issue} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id}-email`}>{copy.email}</Label>
              <Input
                id={`${id}-email`}
                type="email"
                dir="ltr"
                autoComplete="off"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy || Boolean(issued)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-role`}>{copy.role}</Label>
              <select
                id={`${id}-role`}
                className={controlStyle}
                value={role}
                aria-describedby={`${id}-role-help`}
                disabled={busy || Boolean(issued)}
                onChange={(event) => {
                  const next = staffRoles.find((value) => value === event.target.value);
                  if (next) setRole(next);
                }}
              >
                {staffRoles.map((value) => (
                  <option key={value} value={value}>
                    {copy[value]}
                  </option>
                ))}
              </select>
              <p id={`${id}-role-help`} className="text-xs leading-5 text-muted-foreground">
                {copy.roleHelp[role]}
              </p>
            </div>
            <Button
              type="submit"
              disabled={busy || !result || !email.trim() || Boolean(issued)}
            >
              <UserPlus aria-hidden="true" />
              {busy ? copy.working : copy.issue}
            </Button>
          </form>
          {failure && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-danger-foreground">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {failure === "unauthenticated" ? copy.unauthenticated : copy[failure]}
            </p>
          )}
          {feedback && (
            <p role="status" className="mt-4 text-sm">
              {copy[feedback]}
            </p>
          )}
          {issued && (
            <div className="mt-5 min-w-0 space-y-3 rounded-md border border-warning/30 bg-warning-subtle p-4">
              <h4 className="font-medium">{copy.manual}</h4>
              <p className="break-all text-sm">
                <bdi dir="ltr">{issued.invitation.email}</bdi> · {copy[issued.invitation.role]}
              </p>
              <p className="text-sm">{copy.warning}</p>
              <p className="text-sm">{copy.once}</p>
              <Label htmlFor={`${id}-link`}>{copy.link}</Label>
              <Input id={`${id}-link`} value={issued.link} readOnly dir="ltr" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copyLink(issued.link)}>
                  {copy.copyLink}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIssued(undefined);
                    setFeedback(undefined);
                  }}
                >
                  {copy.dismiss}
                </Button>
              </div>
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-6" aria-live="polite" aria-busy={!result}>
          {!result ? (
            <p role="status" className="rounded-lg border border-border bg-surface p-5 text-sm text-muted-foreground">
              {copy.loading}
            </p>
          ) : result.status !== "ready" ? (
            <TeamReadError status={result.status} copy={copy} retry={refresh} />
          ) : (
            <>
              <section
                aria-labelledby={`${id}-members`}
                className="rounded-lg border border-border bg-surface p-5 sm:p-6"
              >
                <h3 id={`${id}-members`} className="font-semibold">{copy.membersTitle}</h3>
                <ul className="mt-3 divide-y divide-border">
                  {result.members.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">
                          {member.fullName}
                          {member.id === scope.userId && (
                            <span className="ms-2 text-xs font-normal text-muted-foreground">({copy.you})</span>
                          )}
                        </p>
                        <p className="break-all text-xs text-muted-foreground">
                          {member.email ? <bdi dir="ltr">{member.email}</bdi> : copy.noEmail}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {copy[member.role]}
                        {!member.active && ` · ${copy.inactive}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section
                aria-labelledby={`${id}-invitations`}
                className="rounded-lg border border-border bg-surface p-5 sm:p-6"
              >
                <h3 id={`${id}-invitations`} className="font-semibold">{copy.invitationsTitle}</h3>
                {result.invitations.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {result.invitations.map((invitation) => (
                      <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0 space-y-1">
                          <p className="break-all text-sm font-medium">
                            <bdi dir="ltr">{invitation.email}</bdi>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {copy[invitation.role]} · {copy[invitation.state]}
                          </p>
                          {invitation.state === "PENDING" && (
                            <p className="text-xs text-muted-foreground">
                              {copy.expires}:{" "}
                              <time dateTime={invitation.expiresAt}>{formatDate(invitation.expiresAt)}</time>
                            </p>
                          )}
                        </div>
                        {invitation.state === "PENDING" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={copy.revokeLabel.replace("{email}", invitation.email)}
                            onClick={() => revoke(invitation.id)}
                          >
                            {copy.revoke}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamReadError({
  status,
  copy,
  retry,
}: {
  status: Exclude<StaffReadResult["status"], "ready">;
  copy: Copy;
  retry: () => void;
}) {
  if (status === "forbidden") return <DriverAccessDenied />;
  return (
    <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-danger-foreground" />
        <p role="alert" className="text-sm leading-6">
          {status === "changed" ? copy.changed : copy.loadingFailed}
        </p>
      </div>
      {status === "changed" ? (
        <Button asChild variant="outline" className="mt-4">
          <a href="/app/team">{copy.reload}</a>
        </Button>
      ) : (
        <Button type="button" variant="outline" className="mt-4" onClick={retry}>
          {copy.refresh}
        </Button>
      )}
    </div>
  );
}
