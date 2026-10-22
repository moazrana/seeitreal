-- Duplicate cuisine types (menu categories) per restaurant are no longer
-- allowed. Before adding the unique index, merge any existing duplicates:
-- keep the oldest row per (restaurant, name) and move dishes from the
-- others onto it, so no dish loses its cuisine type. GROUP BY uses the
-- column's case-insensitive collation, matching the new index exactly.
-- Static statements only — no user input.

UPDATE `menu_items` mi
  JOIN `menu_categories` c ON mi.`category_id` = c.`id`
  JOIN (
    SELECT `restaurant_id`, `name`, MIN(`id`) AS keep_id
    FROM `menu_categories`
    GROUP BY `restaurant_id`, `name`
  ) k ON k.`restaurant_id` = c.`restaurant_id` AND k.`name` = c.`name`
SET mi.`category_id` = k.keep_id
WHERE c.`id` <> k.keep_id;

DELETE c FROM `menu_categories` c
  JOIN (
    SELECT `restaurant_id`, `name`, MIN(`id`) AS keep_id
    FROM `menu_categories`
    GROUP BY `restaurant_id`, `name`
  ) k ON k.`restaurant_id` = c.`restaurant_id` AND k.`name` = c.`name`
WHERE c.`id` <> k.keep_id;

-- CreateIndex
CREATE UNIQUE INDEX `menu_categories_restaurant_id_name_key` ON `menu_categories`(`restaurant_id`, `name`);
