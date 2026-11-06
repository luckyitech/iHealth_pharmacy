-- Who did what and when: one line per step (held, recalled, printed, changed ...), never updated
-- or deleted, and shown on screen as each record's History. The audit log stays the security
-- record (sign-ins, refusals, IP addresses); this is the pharmacy's own record of the work.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_activity (
  ACTIVITY_ID  BIGINT      NOT NULL AUTO_INCREMENT,
  PHARMACY_ID  INT         NULL,
  SUBJECT_TYPE VARCHAR(32) NOT NULL,
  SUBJECT_ID   VARCHAR(64) NOT NULL,
  ACTION       VARCHAR(48) NOT NULL,
  EMPLOYEE_ID  INT         NULL,
  OCCURRED_AT  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  DETAILS      JSON        NULL,
  PRIMARY KEY (ACTIVITY_ID),
  KEY IDX_IH_ACTIVITY_SUBJECT (SUBJECT_TYPE, SUBJECT_ID, OCCURRED_AT),
  KEY IDX_IH_ACTIVITY_TYPE (SUBJECT_TYPE, PHARMACY_ID, OCCURRED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
