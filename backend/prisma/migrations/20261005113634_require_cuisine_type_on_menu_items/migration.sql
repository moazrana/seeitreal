-- Every dish now needs a cuisine type (menu category). Before making the
-- column NOT NULL, backfill: each restaurant with uncategorized dishes gets
-- an "Other" cuisine type (reusing one that already exists — the name
-- comparison follows the column's case-insensitive collation, matching the
-- unique (restaurant_id, name) index) and those dishes are moved onto it.
-- Static statements only — no user input.

INSERT INTO `menu_categories` (`restaurant_id`, `name`, `sort_order`, `created_at`, `updated_at`)
SELECT DISTINCT mi.`restaurant_id`, 'Other', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `menu_items` mi
WHERE mi.`category_id` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `menu_categories` c
    WHERE c.`restaurant_id` = mi.`restaurant_id` AND c.`name` = 'Other'
  );

UPDATE `menu_items` mi
  JOIN `menu_categories` c
    ON c.`restaurant_id` = mi.`restaurant_id` AND c.`name` = 'Other'
SET mi.`category_id` = c.`id`
WHERE mi.`category_id` IS NULL;

-- A cuisine type that still has dishes can no longer be deleted (it used
-- to SET NULL, which would now violate NOT NULL).
-- DropForeignKey
ALTER TABLE `menu_items` DROP FOREIGN KEY `menu_items_category_id_fkey`;

-- AlterTable
ALTER TABLE `menu_items` MODIFY `category_id` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
