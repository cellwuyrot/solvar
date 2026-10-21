-- Additive migration. Existing orders and customer data are preserved.
ALTER TABLE shop_orders ADD COLUMN assigned_to TEXT NOT NULL DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN telegram_delivered_chats TEXT NOT NULL DEFAULT '[]';
