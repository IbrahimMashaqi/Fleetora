-- at: 8faca95d054b124a36c5a93ca6fef78946a8653f5f978d2dfb92f881caffe1f3
-- OD-10: parcels stored with LOW before the priority migration (fictional data).
INSERT INTO "companies" ("id", "name", "updatedAt")
VALUES ('d0100000-0000-4000-8000-000000000001', 'Fictional priority migration company', now());
INSERT INTO "users" ("id", "companyId", "fullName", "password", "role", "updatedAt")
VALUES ('d0100000-0000-4000-8000-0000000000f1', 'd0100000-0000-4000-8000-000000000001', 'Fictional requester', 'not-a-password-hash', 'COMPANY_ADMIN', now());
INSERT INTO "shipments" ("id", "companyId", "requestedBy", "destination", "priority", "updatedAt") VALUES
  ('d0100000-0000-4000-8000-0000000000a1', 'd0100000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-0000000000f1', 'Fictional street 1', 'LOW', now()),
  ('d0100000-0000-4000-8000-0000000000a2', 'd0100000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-0000000000f1', 'Fictional street 2', 'HIGH', now()),
  ('d0100000-0000-4000-8000-0000000000a3', 'd0100000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-0000000000f1', 'Fictional street 3', 'URGENT', now()),
  ('d0100000-0000-4000-8000-0000000000a4', 'd0100000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-0000000000f1', 'Fictional street 4', 'NORMAL', now());
