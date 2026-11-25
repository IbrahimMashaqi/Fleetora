-- at: f0ba33380248edd4599dfcbb3e7f84bff45cf5c9b67ffe362e8b073a1ef7aa0e
-- OD-02: companies as they exist before company currency (fictional data).
-- c1 uses USD only (merchant + shipment + plan), c2 has no money rows, c3 uses JOD only.
INSERT INTO "companies" ("id", "name", "updatedAt") VALUES
  ('d0200000-0000-4000-8000-0000000000c1', 'Fictional USD company', now()),
  ('d0200000-0000-4000-8000-0000000000c2', 'Fictional empty company', now()),
  ('d0200000-0000-4000-8000-0000000000c3', 'Fictional JOD company', now());
INSERT INTO "users" ("id", "companyId", "fullName", "password", "role", "updatedAt")
VALUES ('d0200000-0000-4000-8000-0000000000f1', 'd0200000-0000-4000-8000-0000000000c1', 'Fictional requester', 'not-a-password-hash', 'COMPANY_ADMIN', now());
INSERT INTO "merchants" ("id", "companyId", "name", "contactName", "phone", "pickupAddress", "city", "currency", "deliveryFeeMinor", "returnFeeMinor", "feePayer", "updatedAt") VALUES
  ('d0200000-0000-4000-8000-0000000000e1', 'd0200000-0000-4000-8000-0000000000c1', 'Fictional USD shop', 'Contact', '+0000000201', 'Street 1', 'City', 'USD', 500, 0, 'MERCHANT', now());
INSERT INTO "shipments" ("id", "companyId", "requestedBy", "merchantId", "destination", "currency", "updatedAt") VALUES
  ('d0200000-0000-4000-8000-0000000000a1', 'd0200000-0000-4000-8000-0000000000c1', 'd0200000-0000-4000-8000-0000000000f1', 'd0200000-0000-4000-8000-0000000000e1', 'Street 2', 'USD', now());
INSERT INTO "merchant_plans" ("id", "companyId", "name", "currency", "updatedAt") VALUES
  ('d0200000-0000-4000-8000-0000000000b1', 'd0200000-0000-4000-8000-0000000000c1', 'Fictional USD plan', 'USD', now()),
  ('d0200000-0000-4000-8000-0000000000b3', 'd0200000-0000-4000-8000-0000000000c3', 'Fictional JOD plan', 'JOD', now());
