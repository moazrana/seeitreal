-- AlterTable
ALTER TABLE `root_admin_users` ADD COLUMN `totp_challenge_jti` VARCHAR(64) NULL;
