"use client";
import type { ReactNode } from "react";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { ErrorState, ReadState } from "./operations-ui";
import { useOperations, useOperationScope } from "../use-operations";
import type { Scope } from "../operations-contract";

export type Permissions = Record<string, boolean>;
export function OperationsWorkspace({
  children,
}: {
  children: (scope: Scope, permissions: Permissions) => ReactNode;
}) {
  const { user } = useProtectedSession();
  if (
    !user.company ||
    !user.orgId ||
    !["COMPANY_ADMIN", "ACCOUNTANT"].includes(user.role)
  )
    return <ErrorState status="forbidden" />;
  return (
    <WorkspaceContent key={`${user.id}:${user.orgId}:${user.role}`}>
      {children}
    </WorkspaceContent>
  );
}
function WorkspaceContent({
  children,
}: {
  children: (scope: Scope, permissions: Permissions) => ReactNode;
}) {
  const scope = useOperationScope();
  const config = useOperations(scope, { resource: "config" });
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <ReadState result={config.result} retry={config.retry}>
        {(data) =>
          data.kind === "config" ? (
            children(scope, data.capabilities)
          ) : (
            <ErrorState status="unavailable" retry={config.retry} />
          )
        }
      </ReadState>
    </div>
  );
}
export function PageIntro({
  title,
  description,
  children,
}: {
  title: TranslationKey;
  description?: TranslationKey;
  children?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t(title)}</h2>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {t(description)}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
