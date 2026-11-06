-- Approvals at the till: what a cashier may not do alone (a discount above the limit, a changed
-- price, selling below cost, cancelling a bill later or someone else's) needs a second person with
-- "Sales approval", who types their username and approval PIN.
-- Additive and idempotent: safe to run again.

-- Every approval: who asked, who approved, why, and what was approved. A sale's approval is first
-- given as a token the till sends with the sale, then tied to the bill once it is saved.
CREATE TABLE IF NOT EXISTS ih_sale_approval (
  APPROVAL_ID  INT          NOT NULL AUTO_INCREMENT,
  TOKEN        CHAR(36)     NOT NULL,
  KIND         VARCHAR(20)  NOT NULL,
  PHARMACY_ID  INT          NOT NULL,
  REQUESTED_BY INT          NOT NULL,
  APPROVED_BY  INT          NULL,
  REASON       VARCHAR(200) NOT NULL,
  DETAILS      JSON         NOT NULL,
  LINES_HASH   CHAR(64)     NULL,
  GIVEN_AWAY   DECIMAL(12,2) NOT NULL DEFAULT 0,
  BILL_ID      INT          NULL,
  CREATED_AT   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  EXPIRES_AT   DATETIME(3)  NULL,
  USED_AT      DATETIME(3)  NULL,
  PRIMARY KEY (APPROVAL_ID),
  UNIQUE KEY UQ_IH_SALE_APPROVAL_TOKEN (TOKEN),
  KEY IDX_IH_SALE_APPROVAL_BILL (BILL_ID),
  KEY IDX_IH_SALE_APPROVAL_DAY (PHARMACY_ID, CREATED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Approval PINs: the legacy table keeps them in plain text. A hashed copy is kept here the first
-- time a PIN is used (the legacy app keeps working), with the count of wrong tries and the lock.
CREATE TABLE IF NOT EXISTS ih_approval_pin (
  EMPLOYEE_ID        INT          NOT NULL,
  PIN_HASH           VARCHAR(255) NULL,
  LEGACY_FINGERPRINT CHAR(64)     NULL,
  FAILED_COUNT       INT          NOT NULL DEFAULT 0,
  LOCKED_UNTIL       DATETIME(3)  NULL,
  UPDATED_AT         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (EMPLOYEE_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- "Sales approval" (new). When it is first added it goes only to the pharmacy manager and super
-- admin roles (matched by name; the legacy data spells the first "PARMACY MANAGER"). After that it
-- is managed on the employee's access tab and never granted again by this file.
INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID, CREATED_BY)
SELECT r.ROLE_ID, 900003, 'ihealth-additive'
FROM pharmacy_roles r
WHERE UPPER(TRIM(r.ROLE_NM)) IN ('PHARMACY MANAGER', 'PARMACY MANAGER', 'SUPER ADMIN')
  AND NOT EXISTS (SELECT 1 FROM pharma_access WHERE PHARMA_ACCESS_ID = 900003);

INSERT INTO pharma_access (PHARMA_ACCESS_ID, ACCESS_CD, ACCESS_NAME, ACTIVE_S, CREATION_USER_ID)
VALUES (900003, 'Sales', 'Sales approval', 'Y', 'ihealth-additive')
ON DUPLICATE KEY UPDATE ACCESS_NAME = ACCESS_NAME;
