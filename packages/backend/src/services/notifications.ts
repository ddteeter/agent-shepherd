import notifier from 'node-notifier';

export class NotificationService {
  /**
   * Send an OS-level notification that a PR is ready for review.
   * Safe to call in any environment — errors are caught and logged silently.
   */
  notifyPRReadyForReview(prTitle: string, projectName: string): void {
    try {
      notifier.notify({
        title: 'Agent Shepherd',
        message: `PR ready for review: ${prTitle}\nProject: ${projectName}`,
      });
    } catch {
      // Swallow errors — notifications are best-effort.
      // This keeps the service safe in CI, tests, or environments
      // where the notification subsystem is unavailable.
    }
  }
}
