INSERT INTO "ppob_billers" ("id", "merchant_id", "code", "name", "sub", "category", "margin_amount", "is_active")
SELECT gen_random_uuid()::text, "id", 'games', 'Voucher game', 'Mobile Legends, Free Fire, dan lainnya', 'games', 2000, true
FROM "merchants"
ON CONFLICT ("merchant_id", "code") DO NOTHING;

INSERT INTO "ppob_billers" ("id", "merchant_id", "code", "name", "sub", "category", "margin_amount", "is_active")
SELECT gen_random_uuid()::text, "id", 'tv_voucher', 'Voucher TV', 'K-Vision dan TV prabayar', 'tv_voucher', 2000, true
FROM "merchants"
ON CONFLICT ("merchant_id", "code") DO NOTHING;

INSERT INTO "ppob_billers" ("id", "merchant_id", "code", "name", "sub", "category", "margin_amount", "is_active")
SELECT gen_random_uuid()::text, "id", 'gas', 'Gas', 'Produk gas prabayar', 'gas', 2000, true
FROM "merchants"
ON CONFLICT ("merchant_id", "code") DO NOTHING;
