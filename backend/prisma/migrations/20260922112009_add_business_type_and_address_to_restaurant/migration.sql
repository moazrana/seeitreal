/*
  Warnings:

  - Added the required column `gateway` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `restaurants` ADD COLUMN `address` VARCHAR(500) NULL,
    ADD COLUMN `business_type` ENUM('restaurant') NOT NULL DEFAULT 'restaurant';

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `gateway` ENUM('stripe', 'safepay') NOT NULL,
    ADD COLUMN `grace_until` DATETIME(3) NULL,
    MODIFY `status` ENUM('active', 'past_due', 'expired', 'canceled') NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX `subscriptions_gateway_subscription_id_idx` ON `subscriptions`(`gateway_subscription_id`);
