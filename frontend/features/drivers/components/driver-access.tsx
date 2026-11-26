"use client";
import { useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { withSessionLock } from "@/lib/auth/session-lock";
import { driverAccessAction } from "../driver-access.action";
import type { DriverScope } from "../drivers.types";
import type {
  DriverAccessOperation,
  DriverAccessResult,
} from "../driver-access.types";

export function DriverAccessControls({
  id,
  scope,
  onPending,
  onUpdated,
}: {
  id: string;
  scope: DriverScope;
  onPending(value: boolean): void;
  onUpdated(): void;
}) {
  const { locale } = useLocale();
  const c = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [state, setState] = useState<DriverAccessResult | null>(null);
  const [issued, setIssued] = useState<Extract<
    DriverAccessResult,
    { status: "issued" }
  > | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirm, setConfirm] = useState<"revokeAccess" | "offboard" | null>(
    null,
  );
  const [revokeOnOffboard, setRevokeOnOffboard] = useState(false);
  const locked = useRef(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stale = false;
    withSessionLock(() => driverAccessAction(scope, { id, kind: "read" }))
      .then((result) => {
        if (!stale) setState(result);
      })
      .catch((error) => {
        unstable_rethrow(error);
        if (!stale) setState({ status: "unavailable" });
      });
    return () => {
      stale = true;
    };
  }, [id, scope, version]);
  async function run(operation: DriverAccessOperation) {
    if (locked.current || uncertain || state?.status !== "ready") return;
    locked.current = true;
    setBusy(true);
    onPending(true);
    setFeedback("");
    try {
      const result = await withSessionLock(() =>
        driverAccessAction(scope, operation),
      );
      if (result.status === "issued") {
        setIssued(result);
        setVersion((v) => v + 1);
      } else if (result.status === "updated") {
        setIssued(null);
        setConfirm(null);
        setFeedback(c("Access updated.", "تم تحديث الوصول."));
        setVersion((v) => v + 1);
        onUpdated();
      } else {
        setIssued(null);
        setUncertain(result.status === "uncertain");
        setFeedback(
          result.status === "uncertain"
            ? c(
                "Result unknown. Refresh before trying again.",
                "النتيجة غير مؤكدة. حدّث قبل المحاولة مجددًا.",
              )
            : c(
                "Action rejected or unavailable. Refresh and check the driver phone and your access.",
                "تعذر الإجراء أو رُفض. حدّث وتحقق من رقم السائق وصلاحيتك.",
              ),
        );
      }
    } catch (error) {
      unstable_rethrow(error);
      setIssued(null);
      setUncertain(true);
      setFeedback(
        c(
          "Result unknown. Refresh before trying again.",
          "النتيجة غير مؤكدة. حدّث قبل المحاولة مجددًا.",
        ),
      );
    } finally {
      locked.current = false;
      setBusy(false);
      onPending(false);
    }
  }
  const data = state?.status === "ready" ? state.data : null;
  return (
    <section
      aria-labelledby="driver-login-title"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <h3 id="driver-login-title" className="font-semibold">
        {c("Driver login access", "وصول السائق لتسجيل الدخول")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {c(
          "Invite this driver to set a password. For a forgotten password, reissue the invitation. Suspension keeps login access; security revocation logs the driver out immediately.",
          "ادعُ هذا السائق لاختيار كلمة مرور. عند نسيانها أعد إصدار الدعوة. الإيقاف يبقي تسجيل الدخول؛ إلغاء الوصول الأمني يسجل خروجه فورًا.",
        )}
      </p>
      {!state ? (
        <p role="status">{c("Loading access…", "تحميل الوصول…")}</p>
      ) : !data ? (
        <p role="alert">
          {c("Driver access could not be loaded.", "تعذر تحميل وصول السائق.")}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {data.offboarded
              ? c("Offboarded — no new tasks", "أُنهِي عمله — دون مهام جديدة")
              : data.linked
                ? data.accessActive
                  ? c("Login enabled", "تسجيل الدخول مفعّل")
                  : c("Access revoked", "الوصول ملغى")
                : c("No login account linked", "لا يوجد حساب دخول مرتبط")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || uncertain}
              onClick={() => void run({ id, kind: "invite" })}
            >
              {data.linked || data.pendingInvitation
                ? c("Reissue invitation", "إعادة إصدار الدعوة")
                : c("Create driver invitation", "إنشاء دعوة للسائق")}
            </Button>
            {data.pendingInvitation && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || uncertain}
                onClick={() => void run({ id, kind: "revokeInvitation" })}
              >
                {c("Revoke invitation", "إلغاء الدعوة")}
              </Button>
            )}
            {data.accessActive && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || uncertain}
                onClick={() => setConfirm("revokeAccess")}
              >
                {c("Revoke access", "إلغاء الوصول")}
              </Button>
            )}
            {!data.offboarded && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || uncertain}
                onClick={() => setConfirm("offboard")}
              >
                {c("Offboard driver", "إنهاء عمل السائق")}
              </Button>
            )}
          </div>
          {data.pendingInvitation && (
            <p className="text-xs text-muted-foreground">
              {c("Invitation expires: ", "تنتهي الدعوة: ")}
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(data.pendingInvitation.expiresAt))}
            </p>
          )}
        </>
      )}
      {confirm && (
        <div
          role="group"
          className="space-y-3 rounded-md border p-3"
          aria-label={c("Confirm access change", "تأكيد تغيير الوصول")}
        >
          <p className="text-sm">
            {confirm === "revokeAccess"
              ? c(
                  "Immediately log out this driver and block login? Existing custody and COD obligations remain.",
                  "تسجيل خروج السائق فورًا ومنع دخوله؟ تبقى العهدة والتزامات التحصيل الحالية.",
                )
              : c(
                  "Stop new tasks for this driver? Existing custody, COD and history stay recorded. Final settlement is handled later.",
                  "إيقاف المهام الجديدة لهذا السائق؟ تبقى العهدة والتحصيل والسجل محفوظة. التسوية النهائية لاحقًا.",
                )}
          </p>
          {confirm === "offboard" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={revokeOnOffboard}
                onChange={(e) => setRevokeOnOffboard(e.target.checked)}
                disabled={busy || uncertain}
              />
              {c("Also revoke login access", "إلغاء وصول تسجيل الدخول أيضًا")}
            </label>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={busy || uncertain}
              onClick={() =>
                void run(
                  confirm === "offboard"
                    ? { id, kind: "offboard", revokeAccess: revokeOnOffboard }
                    : { id, kind: "revokeAccess" },
                )
              }
            >
              {c("Confirm", "تأكيد")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || uncertain}
              onClick={() => setConfirm(null)}
            >
              {c("Cancel", "إلغاء")}
            </Button>
          </div>
        </div>
      )}
      {issued && (
        <div className="space-y-3 rounded-md border p-3">
          <Label htmlFor="driver-invitation-link">
            {c("Driver activation link", "رابط تفعيل السائق")}
          </Label>
          <Input
            id="driver-invitation-link"
            dir="ltr"
            readOnly
            value={issued.url}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued.url);
                  setFeedback(c("Link copied.", "نُسخ الرابط."));
                } catch {
                  setFeedback(
                    c("Copy the link from the field.", "انسخ الرابط من الحقل."),
                  );
                }
              }}
            >
              {c("Copy link", "نسخ الرابط")}
            </Button>
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/${issued.phone.slice(1)}?text=${encodeURIComponent("مرحبًا، فعّل حسابك كسائق Fleetora واختر كلمة مرور عبر الرابط.\nHello, activate your Fleetora driver account and choose a password:\n" + issued.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {c("Send via WhatsApp", "إرسال عبر واتساب")}
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIssued(null)}
            >
              {c("Dismiss link", "إخفاء الرابط")}
            </Button>
          </div>
        </div>
      )}
      {feedback && (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setIssued(null);
          setState(null);
          setConfirm(null);
          setUncertain(false);
          setVersion((v) => v + 1);
        }}
      >
        {c("Refresh access", "تحديث الوصول")}
      </Button>
    </section>
  );
}
