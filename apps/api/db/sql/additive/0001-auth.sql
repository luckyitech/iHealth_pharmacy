-- Additive tables for authentication, authorisation and auditing (ADR 0003, ADR 0004).
-- Prefixed `ih_` to set them apart from legacy tables. Idempotent. Never alters a legacy table.
-- Foreign keys to legacy tables are deliberately not declared: legacy tables may be truncated or
-- reloaded by the legacy system, and that must never fail because of these tables.

-- Upgraded password hashes (argon2id). The legacy CURRENT_PASSWORD column is never written.
-- LEGACY_FINGERPRINT is a SHA-256 of the legacy value the hash was derived from: if the legacy
-- system changes the password, the fingerprint no longer matches and the legacy value wins again.
CREATE TABLE IF NOT EXISTS ih_employee_password (
  EMPLOYEE_CREDENTIALS_ID INT          NOT NULL,
  PASSWORD_HASH           VARCHAR(255) NOT NULL,
  LEGACY_FINGERPRINT      CHAR(64)     NOT NULL,
  CREATED_AT              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UPDATED_AT              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (EMPLOYEE_CREDENTIALS_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Rotating refresh tokens. Only a SHA-256 of each token is stored. A family is one sign-in; reusing
-- a rotated token revokes the whole family.
CREATE TABLE IF NOT EXISTS ih_refresh_token (
  REFRESH_TOKEN_ID BIGINT       NOT NULL AUTO_INCREMENT,
  FAMILY_ID        CHAR(36)     NOT NULL,
  EMPLOYEE_ID      INT          NOT NULL,
  TOKEN_HASH       CHAR(64)     NOT NULL,
  EXPIRES_AT       DATETIME(3)  NOT NULL,
  CREATED_AT       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  REVOKED_AT       DATETIME(3)  NULL,
  REVOKED_REASON   VARCHAR(30)  NULL,
  REPLACED_BY_ID   BIGINT       NULL,
  USER_AGENT       VARCHAR(255) NULL,
  IP_ADDRESS       VARCHAR(45)  NULL,
  PRIMARY KEY (REFRESH_TOKEN_ID),
  UNIQUE KEY UK_IH_REFRESH_TOKEN_HASH (TOKEN_HASH),
  KEY IDX_IH_REFRESH_TOKEN_FAMILY (FAMILY_ID),
  KEY IDX_IH_REFRESH_TOKEN_EMPLOYEE (EMPLOYEE_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Permissions granted to a role (pharmacy_roles.ROLE_ID, assigned through employee_pharmacy_role).
-- The legacy system has no such table: it only knows per-employee grants (employee_access).
CREATE TABLE IF NOT EXISTS ih_role_permission (
  ROLE_ID          INT         NOT NULL,
  PHARMA_ACCESS_ID INT         NOT NULL,
  CREATED_AT       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CREATED_BY       VARCHAR(50) NULL,
  PRIMARY KEY (ROLE_ID, PHARMA_ACCESS_ID),
  KEY IDX_IH_ROLE_PERMISSION_ACCESS (PHARMA_ACCESS_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Append-only audit trail: sign-ins, permission denials and access to sensitive records.
CREATE TABLE IF NOT EXISTS ih_audit_log (
  AUDIT_LOG_ID  BIGINT       NOT NULL AUTO_INCREMENT,
  OCCURRED_AT   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  REQUEST_ID    VARCHAR(64)  NULL,
  EMPLOYEE_ID   INT          NULL,
  ACTION        VARCHAR(64)  NOT NULL,
  OUTCOME       VARCHAR(16)  NOT NULL,
  RESOURCE_TYPE VARCHAR(64)  NULL,
  RESOURCE_ID   VARCHAR(64)  NULL,
  IP_ADDRESS    VARCHAR(45)  NULL,
  USER_AGENT    VARCHAR(255) NULL,
  DETAILS       JSON         NULL,
  PRIMARY KEY (AUDIT_LOG_ID),
  KEY IDX_IH_AUDIT_LOG_EMPLOYEE (EMPLOYEE_ID, OCCURRED_AT),
  KEY IDX_IH_AUDIT_LOG_ACTION (ACTION, OCCURRED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
