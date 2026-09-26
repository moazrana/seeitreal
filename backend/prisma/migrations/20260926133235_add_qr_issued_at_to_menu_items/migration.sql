-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `qr_issued_at` DATETIME(3) NULL;

-- Backfill: every dish that is live today already has a scannable QR code,
-- so treat it as issued (updated_at is the best available approximation of
-- when it went live). Static statement, no user input.
UPDATE `menu_items` SET `qr_issued_at` = `updated_at` WHERE `ar_status` = 'live';
