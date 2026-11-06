-- The dosing stickers printed for a bill, as they were printed, so a reprint is the same and what
-- a patient was told can be checked later. The legacy app printed labels from a scratch table it
-- emptied straight after, so nothing was kept. Each print is a set of rows sharing PRINT_ID.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_dispense_label (
  LABEL_ID        INT           NOT NULL AUTO_INCREMENT,
  PRINT_ID        CHAR(36)      NOT NULL,
  BILL_ID         INT           NOT NULL,
  SALES_ITEMS_ID  INT           NOT NULL,
  LABEL_TEXT      VARCHAR(255)  NOT NULL,
  COPIES          INT           NOT NULL,
  PRINTED_BY      INT           NOT NULL,
  PRINTED_AT      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (LABEL_ID),
  KEY IDX_IH_DISPENSE_LABEL_BILL (BILL_ID, PRINTED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
