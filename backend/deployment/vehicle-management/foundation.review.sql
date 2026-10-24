-- REVIEW ONLY: exact DDL extracted from the existing recorded foundation ops.json.
-- Not a replacement migration or ledger; execute ONLY through the approved
-- Prisma runner after full baseline verification. No backfill or auth cutover.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "public"."company_memberships" (
  "companyId" text NOT NULL,
  "createdAt" timestamptz DEFAULT (now()) NOT NULL,
  "id" text NOT NULL,
  "principalType" text NOT NULL,
  "status" text DEFAULT 'INACTIVE' NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "userId" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "company_memberships_principalType_check_d2343e87" CHECK ("principalType" IN ('STAFF', 'MERCHANT', 'DRIVER')),
  CONSTRAINT "company_memberships_status_check_7232e080" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'REVOKED'))
);

CREATE TABLE "public"."platform_admin_grants" (
  "createdAt" timestamptz DEFAULT (now()) NOT NULL,
  "grantedById" text,
  "id" text NOT NULL,
  "revokedAt" timestamptz,
  "revokedById" text,
  "status" text NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "userId" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "platform_admin_grants_revocation_state_7d7025f9" CHECK (("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "revokedById" IS NULL) OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)),
  CONSTRAINT "platform_admin_grants_status_check_35f03e2c" CHECK ("status" IN ('ACTIVE', 'REVOKED'))
);

ALTER TABLE "public"."platform_admin_grants" ADD CONSTRAINT "platform_admin_grants_userId_key" UNIQUE ("userId");

CREATE INDEX "company_memberships_companyId_idx_33acc5ed" ON "public"."company_memberships" ("companyId");

CREATE INDEX "company_memberships_companyId_status_idx_86f6fb02" ON "public"."company_memberships" ("companyId", "status");

CREATE UNIQUE INDEX "company_memberships_one_active_user_0293bafb" ON "public"."company_memberships" ("userId") WHERE ("status" = 'ACTIVE');

CREATE INDEX "company_memberships_userId_status_idx_e4a128ba" ON "public"."company_memberships" ("userId", "status");

CREATE INDEX "platform_admin_grants_grantedById_idx_416f9b2b" ON "public"."platform_admin_grants" ("grantedById");

CREATE INDEX "platform_admin_grants_revokedById_idx_ab374353" ON "public"."platform_admin_grants" ("revokedById");

CREATE INDEX "platform_admin_grants_status_idx_e98638ab" ON "public"."platform_admin_grants" ("status");

ALTER TABLE "public"."company_memberships"
ADD CONSTRAINT "company_memberships_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "public"."users" ("id")
ON DELETE RESTRICT;

ALTER TABLE "public"."company_memberships"
ADD CONSTRAINT "company_memberships_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "public"."companies" ("id")
ON DELETE RESTRICT;

ALTER TABLE "public"."platform_admin_grants"
ADD CONSTRAINT "platform_admin_grants_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "public"."users" ("id")
ON DELETE RESTRICT;

ALTER TABLE "public"."platform_admin_grants"
ADD CONSTRAINT "platform_admin_grants_grantedById_fkey"
FOREIGN KEY ("grantedById")
REFERENCES "public"."users" ("id")
ON DELETE RESTRICT;

ALTER TABLE "public"."platform_admin_grants"
ADD CONSTRAINT "platform_admin_grants_revokedById_fkey"
FOREIGN KEY ("revokedById")
REFERENCES "public"."users" ("id")
ON DELETE RESTRICT;
-- The approved runner, not this preview, verifies and advances marker/ledger.
COMMIT;
