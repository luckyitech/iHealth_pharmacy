-- What the controlled-drug register needs about each controlled drug sold at the new till, beyond
-- what the legacy bill keeps: the patient's ID number, and the patient and prescription as they
-- were at the sale. Written in the same transaction as the bill. The quantities in and out come
-- from the legacy stock_history table, which the legacy triggers fill for every stock change.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_controlled_dispense (
  DISPENSE_ID        INT           NOT NULL AUTO_INCREMENT,
  PHARMACY_ID        INT           NOT NULL,
  BILL_ID            INT           NOT NULL,
  ITEM_ID            INT           NOT NULL,
  STOCK_ID           INT           NOT NULL,
  QUANTITY           INT           NOT NULL,
  PATIENT_NAME       VARCHAR(100)  NOT NULL,
  PATIENT_PHONE      VARCHAR(20)   NOT NULL,
  PATIENT_ID_NUMBER  VARCHAR(20)   NOT NULL,
  DOCTOR_ID          INT           NOT NULL,
  PRESCRIBED_ON      DATE          NOT NULL,
  EMPLOYEE_ID        INT           NOT NULL,
  CREATED_AT         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (DISPENSE_ID),
  KEY IDX_IH_CONTROLLED_DISPENSE_BILL (BILL_ID),
  KEY IDX_IH_CONTROLLED_DISPENSE_ITEM (ITEM_ID, CREATED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
