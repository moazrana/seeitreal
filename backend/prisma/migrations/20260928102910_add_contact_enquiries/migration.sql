-- CreateTable
CREATE TABLE `contact_enquiries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `business_name` VARCHAR(200) NULL,
    `message` TEXT NOT NULL,
    `ip_hash` VARCHAR(64) NOT NULL,
    `email_status` ENUM('sent', 'not_configured', 'failed') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contact_enquiries_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
