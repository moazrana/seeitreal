-- AlterTable
ALTER TABLE `menu_items` ADD COLUMN `preview_image_url` VARCHAR(2048) NULL,
    ADD COLUMN `qa_note` TEXT NULL,
    ADD COLUMN `tripo_task_id` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `menu_items_ar_status_idx` ON `menu_items`(`ar_status`);

-- CreateIndex
CREATE INDEX `menu_items_tripo_task_id_idx` ON `menu_items`(`tripo_task_id`);
