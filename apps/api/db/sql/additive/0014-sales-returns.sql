-- Sales returns made in the new app: what the legacy sales_return tables do not keep. A return is
-- still written to sales_return, sales_return_item and credit_note, so the legacy reports and the
-- till see it; the returned bill itself is never changed.
-- Additive and idempotent: safe to run again.

-- One per return: who asked, who approved, how the money went back.
CREATE TABLE IF NOT EXISTS ih_sale_return (
  SALES_RETURN_ID  INT           NOT NULL,
  PHARMACY_ID      INT           NOT NULL,
  BILL_ID          INT           NOT NULL,
  REQUESTED_BY     INT           NOT NULL,
  APPROVED_BY      INT           NOT NULL,
  REASON           VARCHAR(30)   NOT NULL,
  REFUND_METHOD    VARCHAR(20)   NOT NULL,
  REFUND_AMOUNT    DECIMAL(12,2) NOT NULL,
  MPESA_CODE       VARCHAR(20)   NULL,
  CREDIT_NOTE_ID   INT           NULL,
  CREATED_AT       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (SALES_RETURN_ID),
  KEY IDX_IH_SALE_RETURN_BILL (BILL_ID),
  KEY IDX_IH_SALE_RETURN_DAY (PHARMACY_ID, CREATED_AT)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- One per line returned: the batch it went back to, or that it was written off.
CREATE TABLE IF NOT EXISTS ih_sale_return_line (
  SALES_RETURN_ID  INT           NOT NULL,
  SALES_ITEMS_ID   INT           NOT NULL,
  STOCK_ID         INT           NOT NULL,
  QUANTITY         INT           NOT NULL,
  RESTOCKED        CHAR(1)       NOT NULL,
  REFUND_AMOUNT    DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (SALES_RETURN_ID, SALES_ITEMS_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- What is left on each credit note, and until when it can be spent. A legacy note without a row
-- here still has its whole amount (the legacy app never kept a balance) and never expires.
CREATE TABLE IF NOT EXISTS ih_credit_note (
  CREDIT_NOTE_ID     INT           NOT NULL,
  BALANCE            DECIMAL(12,2) NOT NULL,
  EXPIRES_ON         DATE          NULL,
  ORIGINAL_BILL_ID   INT           NULL,
  REASON             VARCHAR(30)   NULL,
  UPDATED_AT         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (CREDIT_NOTE_ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- The legacy sales_return_item table is MyISAM, which cannot take part in a transaction; with
-- MySQL's GTID consistency on, its insert trigger (which updates stock) is refused outright. As
-- InnoDB, a return saves all together or not at all. Columns, data and meaning are unchanged.
ALTER TABLE sales_return_item ENGINE = InnoDB;
