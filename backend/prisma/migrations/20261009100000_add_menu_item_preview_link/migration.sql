-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `preview_link_nonce` VARCHAR(64) NULL,
    ADD COLUMN `preview_link_expires_at` DATETIME(3) NULL;
