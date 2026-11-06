-- A photo of the prescription a sale was made against, kept with its bill. The legacy table
-- prescription_images needs a registered customer, and most prescription sales are to walk-ins, so
-- the new till keeps photos here, one per bill. The bill's doctor, hospital and prescription date
-- stay in the legacy sales columns.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_prescription_photo (
  BILL_ID       INT          NOT NULL,
  MIME_TYPE     VARCHAR(20)  NOT NULL,
  IMAGE         MEDIUMBLOB   NOT NULL,
  CREATED_BY    INT          NOT NULL,
  CREATED_AT    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (BILL_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
