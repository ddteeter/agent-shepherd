CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`pr_id` text NOT NULL,
	`categories` text DEFAULT '{}' NOT NULL,
	`branch_ref` text,
	`worktree_path` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`pr_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE no action
);
