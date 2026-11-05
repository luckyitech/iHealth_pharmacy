-- One row per sale the till asked to complete, keyed by a random id the till makes for that sale.
-- A second request with the same id (a double click, a retry after a dropped connection) returns
-- the bill already saved instead of selling twice.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_sale_request (
  REQUEST_KEY  CHAR(36)    NOT NULL,
  BILL_ID      INT         NOT NULL,
  EMPLOYEE_ID  INT         NOT NULL,
  CREATED_AT   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (REQUEST_KEY),
  KEY IDX_IH_SALE_REQUEST_BILL (BILL_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
