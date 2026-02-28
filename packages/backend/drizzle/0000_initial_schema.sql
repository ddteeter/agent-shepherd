CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`review_cycle_id` text NOT NULL,
	`file_path` text,
	`start_line` integer,
	`end_line` integer,
	`body` text NOT NULL,
	`severity` text DEFAULT 'suggestion' NOT NULL,
	`author` text NOT NULL,
	`parent_comment_id` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`review_cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `diff_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`review_cycle_id` text NOT NULL,
	`diff_data` text NOT NULL,
	FOREIGN KEY (`review_cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `global_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_config` (
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`project_id`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`base_branch` text DEFAULT 'main' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_path_unique` ON `projects` (`path`);--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source_branch` text NOT NULL,
	`base_branch` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`agent_context` text,
	`agent_session_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`pr_id` text NOT NULL,
	`cycle_number` integer NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_at` text,
	`agent_completed_at` text,
	FOREIGN KEY (`pr_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE no action
);
