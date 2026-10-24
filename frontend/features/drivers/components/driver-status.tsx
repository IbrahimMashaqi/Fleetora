import { useLocale } from "@/lib/i18n";
import type { DriverStatus } from "../drivers.types";

const styles: Record<DriverStatus, { surface: string; dot: string }> = {
  ACTIVE: {
    surface: "border-success-border bg-success-background",
    dot: "bg-success",
  },
  OFFLINE: { surface: "border-border bg-muted", dot: "bg-muted-foreground" },
  ON_BREAK: {
    surface: "border-warning-border bg-warning-background",
    dot: "bg-warning",
  },
  SUSPENDED: {
    surface: "border-danger-border bg-danger-background",
    dot: "bg-destructive",
  },
};

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  const { t } = useLocale();
  const labels: Record<DriverStatus, "Active" | "Offline" | "On break" | "Suspended"> = {
    ACTIVE: "Active",
    OFFLINE: "Offline",
    ON_BREAK: "On break",
    SUSPENDED: "Suspended",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-foreground ${styles[status].surface}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${styles[status].dot}`}
      />
      {t(labels[status])}
    </span>
  );
}
