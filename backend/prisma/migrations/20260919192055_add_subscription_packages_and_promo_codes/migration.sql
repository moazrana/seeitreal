/*
  Warnings:

  - You are about to drop the column `plan_id` on the `restaurants` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `subscriptions` table. All the data in the column will be lost.
  - Added the required column `package_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `restaurants` DROP COLUMN `plan_id`;

-- AlterTable
ALTER TABLE `subscriptions` DROP COLUMN `plan`,
    ADD COLUMN `package_id` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `subscription_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `price_pkr` INTEGER NOT NULL,
    `price_usd` INTEGER NOT NULL,
    `interval` ENUM('monthly', 'yearly') NOT NULL,
    `max_items` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `discount_type` ENUM('percent', 'fixed') NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` ENUM('PKR', 'USD') NULL,
    `applies_to` ENUM('subscription', 'setup', 'deal') NOT NULL,
    `max_redemptions` INTEGER NULL,
    `times_redeemed` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_admin_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `promo_codes_code_key`(`code`),
    INDEX `promo_codes_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_redemptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `promo_code_id` INTEGER NOT NULL,
    `restaurant_id` INTEGER NOT NULL,
    `invoice_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `promo_redemptions_promo_code_id_idx`(`promo_code_id`),
    INDEX `promo_redemptions_restaurant_id_idx`(`restaurant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `subscriptions_package_id_idx` ON `subscriptions`(`package_id`);

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `subscription_packages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promo_codes` ADD CONSTRAINT `promo_codes_created_by_admin_id_fkey` FOREIGN KEY (`created_by_admin_id`) REFERENCES `root_admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promo_redemptions` ADD CONSTRAINT `promo_redemptions_promo_code_id_fkey` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promo_redemptions` ADD CONSTRAINT `promo_redemptions_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promo_redemptions` ADD CONSTRAINT `promo_redemptions_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `charges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
