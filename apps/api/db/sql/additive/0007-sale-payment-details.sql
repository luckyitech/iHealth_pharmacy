-- More ways to pay at the till: card and cheque, alone or split with cash and M-Pesa.
-- The legacy `sales` columns keep the amounts, the cheque number and date. What they have no place
-- for goes here: the card machine's approval code (the legacy app wrongly wrote it into TAXNO) and
-- the cheque's bank. Banks are a short list the pharmacy can edit under Masters.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_bank (
  BANK_ID             INT          NOT NULL AUTO_INCREMENT,
  BANK_CD             VARCHAR(20)  NOT NULL,
  BANK_NAME           VARCHAR(100) NOT NULL,
  ACTIVE_S            CHAR(1)      NOT NULL DEFAULT 'Y',
  CREATION_TS         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CREATION_USER_ID    VARCHAR(50)  NULL,
  LAST_UPDATE_TS      DATETIME(3)  NULL,
  LAST_UPDATE_USER_ID VARCHAR(50)  NULL,
  PRIMARY KEY (BANK_ID),
  UNIQUE KEY UQ_IH_BANK_CODE (BANK_CD)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- A starting list of common Kenyan banks, added once: banks removed or renamed later stay that way.
INSERT INTO ih_bank (BANK_CD, BANK_NAME, CREATION_USER_ID)
SELECT seed.code, seed.name, 'ihealth-additive'
FROM (
  SELECT 'KCB' AS code, 'KCB Bank' AS name UNION ALL
  SELECT 'EQUITY', 'Equity Bank' UNION ALL
  SELECT 'COOP', 'Co-operative Bank' UNION ALL
  SELECT 'NCBA', 'NCBA Bank' UNION ALL
  SELECT 'ABSA', 'Absa Bank Kenya' UNION ALL
  SELECT 'STANBIC', 'Stanbic Bank' UNION ALL
  SELECT 'SCB', 'Standard Chartered' UNION ALL
  SELECT 'IM', 'I&M Bank' UNION ALL
  SELECT 'DTB', 'Diamond Trust Bank' UNION ALL
  SELECT 'FAMILY', 'Family Bank'
) seed
WHERE NOT EXISTS (SELECT 1 FROM ih_bank);

-- One row per bill paid by card or cheque.
CREATE TABLE IF NOT EXISTS ih_sale_payment_detail (
  BILL_ID            INT         NOT NULL,
  CARD_APPROVAL_CODE VARCHAR(45) NULL,
  CHEQUE_BANK_ID     INT         NULL,
  CREATED_AT         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (BILL_ID),
  KEY IDX_IH_SALE_PAYMENT_DETAIL_BANK (CHEQUE_BANK_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- "Accept cheque payments" (new). When it is first added, it goes to the roles and the people who
-- already approve sales (Sales Billing Bonus Items Approval or Sales Return Approval). After that it
-- is managed on the employee's access tab and never granted again by this file.
INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID, CREATED_BY)
SELECT DISTINCT rp.ROLE_ID, 900002, 'ihealth-additive'
FROM ih_role_permission rp
WHERE rp.PHARMA_ACCESS_ID IN (7, 8)
  AND NOT EXISTS (SELECT 1 FROM pharma_access WHERE PHARMA_ACCESS_ID = 900002);

INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_TS, CREATION_USER_ID)
SELECT DISTINCT ea.EMPLOYEE_ID, 900002, 'Y', NOW(), 'ihealth-additive'
FROM employee_access ea
WHERE ea.PHARMA_ACCESS_ID IN (7, 8) AND ea.ACTIVE_S = 'Y'
  AND NOT EXISTS (SELECT 1 FROM pharma_access WHERE PHARMA_ACCESS_ID = 900002);

INSERT INTO pharma_access (PHARMA_ACCESS_ID, ACCESS_CD, ACCESS_NAME, ACTIVE_S, CREATION_USER_ID)
VALUES (900002, 'Sales', 'Accept cheque payments', 'Y', 'ihealth-additive')
ON DUPLICATE KEY UPDATE ACCESS_NAME = ACCESS_NAME;
