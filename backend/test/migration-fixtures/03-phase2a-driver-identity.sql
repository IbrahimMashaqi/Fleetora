-- at: 2ff1b08107872ba334fb1b73e951c3137ffe67ad5ebc122ef5f6d3a4710496ce
-- Existing identities/Workers must retain their data and receive no driver linkage.
INSERT INTO companies (id,name,"updatedAt") VALUES ('phase2a-migration-company','Phase 2a migration fixture',now());
INSERT INTO users (id,"companyId","fullName",password,role,"isActive","isEmailVerified","updatedAt") VALUES
('phase2a-migration-admin','phase2a-migration-company','Existing admin','unusable fixture password','COMPANY_ADMIN',true,true,now()),
('phase2a-migration-accountant','phase2a-migration-company','Existing accountant','unusable fixture password','ACCOUNTANT',true,true,now());
INSERT INTO workers (id,"companyId","fullName",phone,status,"updatedAt") VALUES
('phase2a-migration-worker-1','phase2a-migration-company','Existing Worker','0591234567','SUSPENDED',now()),
('phase2a-migration-worker-2','phase2a-migration-company','Existing Worker','0591234567','OFFLINE',now());
