-- at: 229f7301133a8fb5405ab776de74cea418da9d41a4044c6c44b57ef3c54910f4
-- Legacy approval is independent of existing security suspension and operational data.
INSERT INTO companies (id,name,suspended,"updatedAt") VALUES
('phase3-legacy-active','Existing active company',false,now()),
('phase3-legacy-suspended','Existing suspended company',true,now());
INSERT INTO users (id,"companyId","fullName",password,role,"isActive","isEmailVerified","updatedAt") VALUES
('phase3-legacy-admin','phase3-legacy-active','Existing admin','unusable fixture password','COMPANY_ADMIN',true,true,now());
INSERT INTO workers (id,"companyId","fullName",phone,status,"updatedAt") VALUES
('phase3-legacy-worker','phase3-legacy-suspended','Existing Worker','0591234567','SUSPENDED',now());
