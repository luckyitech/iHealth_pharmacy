-- Accounts that must choose a new password at their next sign-in (set by an administrator, e.g.
-- after giving someone a temporary password). The legacy PASSWORD_STATUS column is left alone:
-- it is set on 3 of 56 accounts and its meaning is not documented.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_password_change_required (
  EMPLOYEE_CREDENTIALS_ID INT         NOT NULL,
  REQUIRED_AT             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  REQUIRED_BY             VARCHAR(50) NULL,
  PRIMARY KEY (EMPLOYEE_CREDENTIALS_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
