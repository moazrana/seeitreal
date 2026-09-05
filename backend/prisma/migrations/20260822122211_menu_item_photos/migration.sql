-- CreateTable
CREATE TABLE `menu_item_photos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `menu_item_id` INTEGER NOT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `menu_item_photos_menu_item_id_idx`(`menu_item_id`),
    UNIQUE INDEX `menu_item_photos_menu_item_id_sort_order_key`(`menu_item_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `menu_item_photos` ADD CONSTRAINT `menu_item_photos_menu_item_id_fkey` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing item with a photo_url already gets that as its
-- first (sort_order 0) photo, so the multi-photo model stays consistent
-- with pre-existing data instead of starting empty.
INSERT INTO `menu_item_photos` (`menu_item_id`, `url`, `sort_order`)
SELECT `id`, `photo_url`, 0 FROM `menu_items` WHERE `photo_url` IS NOT NULL;
