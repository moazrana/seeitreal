-- CreateTable
CREATE TABLE `model_generations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurant_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `menu_item_id` INTEGER NULL,
    `tripo_task_id` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `model_generations_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `model_generations_restaurant_id_idx`(`restaurant_id`),
    INDEX `model_generations_menu_item_id_idx`(`menu_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `model_generations` ADD CONSTRAINT `model_generations_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `model_generations` ADD CONSTRAINT `model_generations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `model_generations` ADD CONSTRAINT `model_generations_menu_item_id_fkey` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

