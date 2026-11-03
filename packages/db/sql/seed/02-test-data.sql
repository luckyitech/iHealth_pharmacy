-- Synthetic seed for automated tests (loaded after 01-pharma-access.sql). Fictional data only: never put real data here.
--
-- Test accounts (test-only passwords; never valid anywhere else):
--   test.admin   / Test-Admin-Pass-1  BCrypt hash, like legacy accounts. Approval PIN 1234 (BCrypt).
--   test.cashier / Test-Cashier-Pass-1  stored in plain text, like some legacy accounts (for upgrade tests).
--   test.inactive / Test-Inactive-Pass-1  plain text, deactivated (ACTIVE_S = 'N').

SET NAMES utf8mb4;
SET time_zone = '+03:00';

INSERT INTO pharmacy (PHARMACY_ID, PHARMACY_NM, TAX_ID, PHONE_NBR, EMAIL_ID, ACTIVE_S, CREATION_USER_ID,
  LAST_UPDATE_TS, AUTHORIZED_PERSON_FIRST_NM, CITY_NM)
VALUES (1, 'Test Pharmacy', 'P000000000T', '+254700000000', 'pharmacy@example.test', 'Y', 'seed',
  NOW(), 'Test', 'Nairobi');

INSERT INTO pharmacy_stock_points (PHARMACY_STOCK_POINTS_ID, PHARMACY_BRANCH_ID, ACTIVE_S, STOCK_POINT_NM,
  STOCK_POINT_TYPE, CREATION_USER_ID)
VALUES (1, 1, 'Y', 'Main Store', 'STORE', 'seed');

INSERT INTO roles (ROLE_ID, ROLE_NM, DESCRIPTION, CREATION_USER_ID)
VALUES (1, 'ADMIN', 'Administrator', 'seed');

INSERT INTO pharmacy_roles (ROLE_ID, ROLE_NM, DESCRIPTION, CREATION_USER_ID)
VALUES (1, 'ADMIN', 'Pharmacy administrator', 'seed'),
       (2, 'CASHIER', 'Cashier', 'seed');

INSERT INTO employee (EMPLOYEE_ID, FIRST_NM, LAST_NM, EMAIL_ID, PHARMACY_ID, ACTIVE_S, EMPLOYEE_CD,
  CREATION_USER_ID, LAST_UPDATE_TS)
VALUES (1, 'Ada', 'Admin', 'admin@example.test', 1, 'Y', 'EMP-T001', 'seed', NOW()),
       (2, 'Carl', 'Cashier', 'cashier@example.test', 1, 'Y', 'EMP-T002', 'seed', NOW()),
       (3, 'Ivy', 'Inactive', 'inactive@example.test', 1, 'N', 'EMP-T003', 'seed', NOW());

INSERT INTO employee_credentials (EMPLOYEE_CREDENTIALS_ID, EMPLOYEE_ID, USER_NM, CURRENT_PASSWORD, ACTIVE_S,
  PASSWORD_STATUS, APPROVAL_ACCESS_PIN, TWO_FACTOR_ENABLED_S, CREATION_USER_ID)
VALUES (1, 1, 'test.admin', '$2b$10$JJ7Aer1AczhFkRnJGS3/u..zWDZXE.jKaMdoEICbOoy0naTbhfGvS', 'Y', 1,
        '$2b$10$pSkSqcUIDnsK1tRVG915Su.8O9wCdzvHc0KhfO6vpP85Kg7kxNo2q', 'N', 'seed'),
       (2, 2, 'test.cashier', 'Test-Cashier-Pass-1', 'Y', 1, NULL, 'N', 'seed'),
       (3, 3, 'test.inactive', 'Test-Inactive-Pass-1', 'N', 1, NULL, 'N', 'seed');

-- The administrator gets permissions through a role; the cashier through individual grants.
INSERT INTO employee_pharmacy_role (EMPLOYEE_PHARMACY_ROLE_ID, EMPLOYEE_ID, PHARMACY_BRANCH_ID, ROLE_ID,
  CREATION_USER_ID)
VALUES (1, 1, 1, 1, 'seed'),
       (2, 2, 1, 2, 'seed');

INSERT INTO employee_access (EMPLOYEE_ACCESS_ID, EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID)
VALUES (1, 2, 6, 'Y', 'seed'),  -- Sales Billing Submission
       (2, 2, 8, 'Y', 'seed'),  -- Sales Return Approval
       (3, 2, 3, 'N', 'seed');  -- Employee Password Change (revoked)
