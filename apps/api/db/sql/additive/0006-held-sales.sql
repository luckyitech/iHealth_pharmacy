-- Sales parked at the till ("hold") so the cashier can serve the next customer, then brought back
-- ("recall") at any till. Only what was chosen is kept: batches, quantities, discounts and the
-- customer. Prices are worked out again when the sale is recalled.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_held_sale (
  HELD_SALE_ID    INT           NOT NULL AUTO_INCREMENT,
  PHARMACY_ID     INT           NOT NULL,
  EMPLOYEE_ID     INT           NOT NULL,
  CUSTOMER_ID     INT           NULL,
  CUSTOMER_NAME   VARCHAR(100)  NULL,
  CUSTOMER_PHONE  VARCHAR(20)   NULL,
  NOTE            VARCHAR(100)  NULL,
  LINES_JSON      JSON          NOT NULL,
  LINE_COUNT      INT           NOT NULL,
  NET_AMOUNT      DECIMAL(12,2) NOT NULL,
  CREATED_AT      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (HELD_SALE_ID),
  KEY IDX_IH_HELD_SALE_PHARMACY (PHARMACY_ID, CREATED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
