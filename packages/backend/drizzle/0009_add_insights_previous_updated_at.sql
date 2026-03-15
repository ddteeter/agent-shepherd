PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`review_cycle_id` text NOT NULL,
	`file_path` text,
	`start_line` integer,
	`end_line` integer,
	`body` text NOT NULL,
	`type` text DEFAULT 'suggestion' NOT NULL,
	`author` text NOT NULL,
	`parent_comment_id` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now') || 'Z') NOT NULL,
	FOREIGN KEY (`review_cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "review_cycle_id", "file_path", "start_line", "end_line", "body", "type", "author", "parent_comment_id", "resolved", "created_at") SELECT "id", "review_cycle_id", "file_path", "start_line", "end_line", "body", "type", "author", "parent_comment_id", "resolved", "created_at" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`pr_id` text NOT NULL,
	`categories` text DEFAULT '{}' NOT NULL,
	`branch_ref` text,
	`worktree_path` text,
	`updated_at` text DEFAULT (datetime('now') || 'Z') NOT NULL,
	`previous_updated_at` text,
	FOREIGN KEY (`pr_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_insights`("id", "pr_id", "categories", "branch_ref", "worktree_path", "updated_at", "previous_updated_at") SELECT "id", "pr_id", "categories", "branch_ref", "worktree_path", "updated_at", NULL FROM `insights`;--> statement-breakpoint
DROP TABLE `insights`;--> statement-breakpoint
ALTER TABLE `__new_insights` RENAME TO `insights`;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`base_branch` text DEFAULT 'main' NOT NULL,
	`created_at` text DEFAULT (datetime('now') || 'Z') NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "name", "path", "base_branch", "created_at") SELECT "id", "name", "path", "base_branch", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_path_unique` ON `projects` (`path`);--> statement-breakpoint
CREATE TABLE `__new_pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source_branch` text NOT NULL,
	`base_branch` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`agent_context` text,
	`working_directory` text,
	`created_at` text DEFAULT (datetime('now') || 'Z') NOT NULL,
	`updated_at` text DEFAULT (datetime('now') || 'Z') NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pull_requests`("id", "project_id", "title", "description", "source_branch", "base_branch", "status", "agent_context", "working_directory", "created_at", "updated_at") SELECT "id", "project_id", "title", "description", "source_branch", "base_branch", "status", "agent_context", "working_directory", "created_at", "updated_at" FROM `pull_requests`;--> statement-breakpoint
DROP TABLE `pull_requests`;--> statement-breakpoint
ALTER TABLE `__new_pull_requests` RENAME TO `pull_requests`;