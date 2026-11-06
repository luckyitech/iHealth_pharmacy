-- "Controlled-drug register" (new): reading the register, which names patients and their ID
-- numbers. When it is first added it goes to the pharmacist, pharmacy manager and super admin roles
-- (matched by name; the legacy data spells "PARMACY MANAGER"). After that it is managed on the
-- employee's access tab and never granted again by this file.
-- Additive and idempotent: safe to run again.

INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID, CREATED_BY)
SELECT r.ROLE_ID, 900004, 'ihealth-additive'
FROM pharmacy_roles r
WHERE UPPER(TRIM(r.ROLE_NM)) IN ('PHARMACIST', 'PHARMACY MANAGER', 'PARMACY MANAGER', 'SUPER ADMIN')
  AND NOT EXISTS (SELECT 1 FROM pharma_access WHERE PHARMA_ACCESS_ID = 900004);

INSERT INTO pharma_access (PHARMA_ACCESS_ID, ACCESS_CD, ACCESS_NAME, ACTIVE_S, CREATION_USER_ID)
VALUES (900004, 'Sales', 'Controlled-drug register', 'Y', 'ihealth-additive')
ON DUPLICATE KEY UPDATE ACCESS_NAME = ACCESS_NAME;
