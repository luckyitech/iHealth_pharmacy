-- Self-service password reset (the legacy system has none). Idempotent; additive only.
-- Only a SHA-256 of each emailed token is stored. A token is valid for 30 minutes and only once.
CREATE TABLE IF NOT EXISTS ih_password_reset (
  PASSWORD_RESET_ID       BIGINT      NOT NULL AUTO_INCREMENT,
  EMPLOYEE_CREDENTIALS_ID INT         NOT NULL,
  TOKEN_HASH              CHAR(64)    NOT NULL,
  EXPIRES_AT              DATETIME(3) NOT NULL,
  USED_AT                 DATETIME(3) NULL,
  CREATED_AT              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  REQUEST_IP              VARCHAR(45) NULL,
  PRIMARY KEY (PASSWORD_RESET_ID),
  UNIQUE KEY UK_IH_PASSWORD_RESET_HASH (TOKEN_HASH),
  KEY IDX_IH_PASSWORD_RESET_CREDENTIALS (EMPLOYEE_CREDENTIALS_ID, CREATED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
