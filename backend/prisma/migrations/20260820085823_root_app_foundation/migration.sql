-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `hidden_by_admin` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `restaurants` ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `suspended_at` DATETIME(3) NULL,
    ADD COLUMN `suspended_reason` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `root_admin_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('superadmin', 'support') NOT NULL DEFAULT 'support',
    `totp_secret_encrypted` VARCHAR(255) NULL,
    `totp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `backup_codes_hashed` TEXT NULL,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `root_admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `root_refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `root_refresh_tokens_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `root_audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `target_type` VARCHAR(50) NULL,
    `target_id` INTEGER NULL,
    `metadata` TEXT NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `root_audit_logs_admin_id_idx`(`admin_id`),
    INDEX `root_audit_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `root_refresh_tokens` ADD CONSTRAINT `root_refresh_tokens_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `root_admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `root_audit_logs` ADD CONSTRAINT `root_audit_logs_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `root_admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
