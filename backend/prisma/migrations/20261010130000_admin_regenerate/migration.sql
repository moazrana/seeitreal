-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `qa_issues` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `model_generations` ADD COLUMN `root_admin_id` INTEGER NULL,
    MODIFY `user_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `model_generations_root_admin_id_created_at_idx` ON `model_generations`(`root_admin_id`, `created_at`);

-- AddForeignKey
ALTER TABLE `model_generations` ADD CONSTRAINT `model_generations_root_admin_id_fkey` FOREIGN KEY (`root_admin_id`) REFERENCES `root_admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

