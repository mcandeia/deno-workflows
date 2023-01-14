CREATE TABLE IF NOT EXISTS `pending_events` (
  `id` TEXT,
  `instance_id` TEXT NOT NULL,
  `type` INTEGER NOT NULL,
  `timestamp` DATETIME NOT NULL,
  `attributes` BLOB NOT NULL,
  `visible_at` DATETIME NULL,
  PRIMARY KEY(`id`, `instance_id`)
);

CREATE INDEX IF NOT EXISTS `idx_pending_events_instance_id_visible_at_schedule_event_id` ON `pending_events` (`instance_id`, `visible_at`);

CREATE TABLE IF NOT EXISTS `history` (
  `id` TEXT,
  `instance_id` TEXT NOT NULL,
  `type` INTEGER NOT NULL,
  `timestamp` DATETIME NOT NULL,
  `attributes` BLOB NOT NULL,
  `visible_at` DATETIME NULL,
  PRIMARY KEY(`id`, `instance_id`)
);

CREATE INDEX IF NOT EXISTS `idx_history_instance_sequence_id` ON `history` (`instance_id`);