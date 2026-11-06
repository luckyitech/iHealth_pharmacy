-- Settings each pharmacy chooses for itself on the Masters screens, one row per setting. A setting
-- without a row has its default from the API's configuration. The legacy `configuration` table is
-- the legacy app's own and is not used for these.
-- Also: with the controlled-drug rules off, a controlled drug may be sold without the register's
-- details, so the register entry keeps whatever was entered.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_pharmacy_setting (
  PHARMACY_ID    INT           NOT NULL,
  SETTING_KEY    VARCHAR(64)   NOT NULL,
  SETTING_VALUE  VARCHAR(255)  NOT NULL,
  UPDATED_BY     INT           NOT NULL,
  UPDATED_AT     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (PHARMACY_ID, SETTING_KEY)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

ALTER TABLE ih_controlled_dispense
  MODIFY PATIENT_NAME VARCHAR(100) NULL,
  MODIFY PATIENT_PHONE VARCHAR(20) NULL,
  MODIFY PATIENT_ID_NUMBER VARCHAR(20) NULL,
  MODIFY DOCTOR_ID INT NULL,
  MODIFY PRESCRIBED_ON DATE NULL;
