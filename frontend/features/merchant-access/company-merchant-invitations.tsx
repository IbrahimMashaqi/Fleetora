"use client";
import {
  useEffect,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { useLocale } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { merchantInvitationsAction } from "./merchant-invitations.action";
import type {
  Invitation,
  InvitationFailure,
  InvitationResult,
  InvitationScope,
} from "./merchant-invitations.types";

const words = {
  en: {
    title: "Merchant app access",
    intro:
      "Invite the business owner to activate their merchant account. The owner can then add employees from the merchant app.",
    email: "Owner email",
    issue: "Create owner invitation",
    issuing: "Creating invitation…",
    manual: "Share this invitation securely",
    warning:
      "No email was sent. Deliver this link directly to the invited owner through a trusted channel. Anyone with it can activate a new account for the invited email.",
    once: "The link and token appear only here. Copy them before dismissing this panel.",
    link: "Activation link",
    token: "Activation token",
    copyLink: "Copy link",
    copyToken: "Copy token",
    copied: "Copied",
    copyFailed: "Copy failed. Select the field and copy it manually.",
    dismiss: "Dismiss invitation secret",
    pending: "Pending",
    accepted: "Accepted",
    expired: "Expired",
    revoked: "Revoked",
    owner: "Owner",
    employee: "Employee",
    expires: "Expires",
    revoke: "Revoke",
    revoking: "Working…",
    loading: "Loading invitations…",
    empty: "No invitations have been issued for this merchant.",
    retry: "Refresh invitations",
    revokedSuccess: "Invitation revoked.",
    loadingFailed: "Invitations could not be loaded. Try again.",
    changed:
      "Your company session changed. Refresh the page before continuing.",
    forbidden:
      "Only an authorized company administrator can manage these invitations.",
    invalid: "Check the email address and try again.",
    notFound: "The merchant or invitation is no longer available.",
    conflict:
      "The merchant already has an owner, or this invitation changed. Refresh the list.",
    uncertain:
      "The result could not be confirmed. Refresh the list before creating another invitation.",
  },
  ar: {
    title: "الوصول إلى تطبيق التاجر",
    intro:
      "ادعُ مالك النشاط لتفعيل حساب التاجر. يستطيع المالك بعدها إضافة الموظفين من تطبيق التاجر.",
    email: "البريد الإلكتروني للمالك",
    issue: "إنشاء دعوة المالك",
    issuing: "جارٍ إنشاء الدعوة…",
    manual: "شارك هذه الدعوة بأمان",
    warning:
      "لم يُرسل بريد إلكتروني. سلّم الرابط مباشرة إلى المالك المدعو عبر قناة موثوقة. من يملك الرابط يستطيع تفعيل حساب جديد للبريد المدعو.",
    once: "يظهر الرابط والرمز هنا فقط. انسخهما قبل إخفاء هذه اللوحة.",
    link: "رابط التفعيل",
    token: "رمز التفعيل",
    copyLink: "نسخ الرابط",
    copyToken: "نسخ الرمز",
    copied: "تم النسخ",
    copyFailed: "تعذر النسخ. حدد النص وانسخه يدوياً.",
    dismiss: "إخفاء رابط ورمز الدعوة",
    pending: "قيد الانتظار",
    accepted: "مقبولة",
    expired: "منتهية",
    revoked: "ملغاة",
    owner: "مالك",
    employee: "موظف",
    expires: "تنتهي",
    revoke: "إلغاء الدعوة",
    revoking: "جارٍ التنفيذ…",
    loading: "جارٍ تحميل الدعوات…",
    empty: "لم تصدر دعوات لهذا التاجر بعد.",
    retry: "تحديث الدعوات",
    revokedSuccess: "تم إلغاء الدعوة.",
    loadingFailed: "تعذر تحميل الدعوات. حاول مجدداً.",
    changed: "تغيرت جلسة الشركة. حدّث الصفحة قبل المتابعة.",
    forbidden: "إدارة هذه الدعوات متاحة فقط لمسؤول الشركة المخوّل.",
    invalid: "تحقق من البريد الإلكتروني وحاول مجدداً.",
    notFound: "التاجر أو الدعوة لم تعد متاحة.",
    conflict: "يوجد مالك للتاجر بالفعل أو تغيرت الدعوة. حدّث القائمة.",
    uncertain: "تعذر تأكيد النتيجة. حدّث القائمة قبل إنشاء دعوة أخرى.",
  },
};

export function CompanyMerchantInvitations({
  merchantId,
}: {
  merchantId: string;
}) {
  const { user } = useProtectedSession();
  if (user.role !== "COMPANY_ADMIN" || !user.orgId) return null;
  return (
    <InvitationPanel
      key={`${user.id}:${user.orgId}:${merchantId}`}
      merchantId={merchantId}
      scope={{ userId: user.id, companyId: user.orgId }}
    />
  );
}

function InvitationPanel({
  merchantId,
  scope,
}: {
  merchantId: string;
  scope: InvitationScope;
}) {
  const { locale } = useLocale();
  const copy = words[locale];
  const id = useId();
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    attempt: number;
    result: InvitationResult;
  }>();
  const [issued, setIssued] = useState<{
    invitation: Invitation;
    token: string;
  }>();
  const [failure, setFailure] = useState<InvitationFailure>();
  const [feedback, setFeedback] = useState<
    "copied" | "copyFailed" | "revokedSuccess"
  >();
  const [busy, startTransition] = useTransition();
  const [, startReadTransition] = useTransition();
  const result = response?.attempt === attempt ? response.result : undefined;
  const message = (status: InvitationFailure) =>
    status === "unavailable" || status === "unauthenticated"
      ? copy.loadingFailed
      : status === "not-found"
        ? copy.notFound
        : copy[status];
  useEffect(() => {
    let active = true;
    startReadTransition(async () => {
      try {
        const result = await withSessionLock(() =>
          merchantInvitationsAction(
            { userId: scope.userId, companyId: scope.companyId },
            merchantId,
            { action: "list" },
          ),
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
  }, [attempt, scope.userId, scope.companyId, merchantId]);

  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || issued) return;
    setFailure(undefined);
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await withSessionLock(() =>
          merchantInvitationsAction(scope, merchantId, {
            action: "issue",
            email,
          }),
        );
        if (result.status === "issued") {
          setIssued(result);
          setEmail("");
          setAttempt((value) => value + 1);
        } else if (result.status !== "ready" && result.status !== "revoked")
          setFailure(result.status);
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
          merchantInvitationsAction(scope, merchantId, {
            action: "revoke",
            id: invitationId,
          }),
        );
        if (result.status === "revoked") {
          if (issued?.invitation.id === invitationId) setIssued(undefined);
          setFeedback("revokedSuccess");
          setAttempt((value) => value + 1);
        } else if (result.status !== "ready" && result.status !== "issued")
          setFailure(result.status);
      } catch (error) {
        unstable_rethrow(error);
        setFailure("uncertain");
      }
    });
  }
  async function copySecret(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("copied");
    } catch {
      setFeedback("copyFailed");
    }
  }
  const activationLink = issued
    ? `fleetora-merchant://app/activate?token=${issued.token}`
    : "";
  const stateText = {
    PENDING: copy.pending,
    ACCEPTED: copy.accepted,
    EXPIRED: copy.expired,
    REVOKED: copy.revoked,
  };
  return (
    <section
      className="rounded-lg border bg-surface p-5 sm:p-6"
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`} className="font-semibold">
        {copy.title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{copy.intro}</p>
      <form
        onSubmit={issue}
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={`${id}-email`}>{copy.email}</Label>
          <Input
            id={`${id}-email`}
            type="email"
            dir="ltr"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy || Boolean(issued)}
          />
        </div>
        <Button
          type="submit"
          disabled={busy || !result || !email.trim() || Boolean(issued)}
        >
          {busy ? copy.revoking : copy.issue}
        </Button>
      </form>
      {failure && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {message(failure)}
        </p>
      )}
      {feedback && (
        <p role="status" className="mt-4 text-sm">
          {copy[feedback]}
        </p>
      )}
      {issued && (
        <div className="mt-5 space-y-3 rounded-md border border-warning/30 bg-warning-subtle p-4">
          <h4 className="font-medium">{copy.manual}</h4>
          <p className="break-all text-sm" dir="ltr">
            {issued.invitation.email}
          </p>
          <p className="text-sm">{copy.warning}</p>
          <p className="text-sm">{copy.once}</p>
          <Label htmlFor={`${id}-link`}>{copy.link}</Label>
          <Input id={`${id}-link`} value={activationLink} readOnly dir="ltr" />
          <Label htmlFor={`${id}-token`}>{copy.token}</Label>
          <Input id={`${id}-token`} value={issued.token} readOnly dir="ltr" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void copySecret(activationLink)}
            >
              {copy.copyLink}
            </Button>
            <Button
              variant="outline"
              onClick={() => void copySecret(issued.token)}
            >
              {copy.copyToken}
            </Button>
            <Button
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
      <div className="mt-6 border-t pt-4" aria-live="polite">
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
          disabled={busy}
        >
          {copy.retry}
        </Button>
        {!result && (
          <p className="mt-3 text-sm text-muted-foreground">{copy.loading}</p>
        )}
        {result?.status === "ready" &&
          (result.items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {result.items.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="break-all text-sm font-medium">
                      <bdi dir="ltr">{invitation.email}</bdi>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {invitation.role === "OWNER" ? copy.owner : copy.employee}{" "}
                      · {stateText[invitation.state]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {copy.expires}:{" "}
                      <time dateTime={invitation.expiresAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(invitation.expiresAt))}
                      </time>
                    </p>
                  </div>
                  {invitation.state === "PENDING" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => revoke(invitation.id)}
                    >
                      {busy ? copy.revoking : copy.revoke}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ))}
        {result &&
          result.status !== "ready" &&
          result.status !== "issued" &&
          result.status !== "revoked" && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {message(result.status)}
            </p>
          )}
      </div>
    </section>
  );
}
