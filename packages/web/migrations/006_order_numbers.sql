-- Stable short numbers for customer-facing order references. The UUID remains internal.
CREATE TABLE IF NOT EXISTS shop_order_counter (
  id TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL
);

-- The setup script adds order_number to older installations before running this migration.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS sequence_number
  FROM shop_orders
  WHERE order_number = 0
), current_max AS (
  SELECT COALESCE(MAX(order_number), 0) AS value FROM shop_orders WHERE order_number > 0
)
UPDATE shop_orders
SET order_number = (SELECT sequence_number FROM numbered WHERE numbered.id = shop_orders.id) + (SELECT value FROM current_max)
WHERE order_number = 0;

CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_order_number_idx ON shop_orders (order_number);
INSERT INTO shop_order_counter (id, value)
VALUES ('main', (SELECT COALESCE(MAX(order_number), 0) FROM shop_orders))
ON CONFLICT(id) DO UPDATE SET value = CASE WHEN excluded.value > shop_order_counter.value THEN excluded.value ELSE shop_order_counter.value END;
