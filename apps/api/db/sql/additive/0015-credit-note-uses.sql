-- Each time a credit note pays for a bill: how much of it was used. The note's balance is kept in
-- ih_credit_note; the bill keeps the legacy CREDIT_NOTE_AMOUNT and SALES_CREDIT_REF_NO.
-- Additive and idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS ih_credit_note_use (
  CREDIT_NOTE_ID  INT           NOT NULL,
  BILL_ID         INT           NOT NULL,
  AMOUNT          DECIMAL(12,2) NOT NULL,
  BALANCE_AFTER   DECIMAL(12,2) NOT NULL,
  USED_BY         INT           NOT NULL,
  USED_AT         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (CREDIT_NOTE_ID, BILL_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
