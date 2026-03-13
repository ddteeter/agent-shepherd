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
    } catch (error: unknown) {
      console.warn('Failed to send OS notification:', error);
    }
  }
}
