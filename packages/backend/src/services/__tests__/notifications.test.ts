import { describe, it, expect, beforeEach, vi } from 'vitest';
import notifier from 'node-notifier';
import { NotificationService } from '../notifications.js';

vi.mock('node-notifier', () => ({
  default: {
    notify: vi.fn(),
  },
}));

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationService();
  });

  describe('notifyPRReadyForReview', () => {
    it('calls node-notifier with correct title and message', () => {
      service.notifyPRReadyForReview('Fix login bug', 'my-app');

      expect(notifier.notify).toHaveBeenCalledOnce();
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Agent Shepherd',
          message: expect.stringContaining('Fix login bug'),
        }),
      );
    });

    it('includes project name in the message', () => {
      service.notifyPRReadyForReview('Add tests', 'cool-project');

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('cool-project'),
        }),
      );
    });

    it('does not throw when node-notifier throws', () => {
      vi.mocked(notifier.notify).mockImplementation(() => {
        throw new Error('Notification system unavailable');
      });

      expect(() => {
        service.notifyPRReadyForReview('Some PR', 'some-project');
      }).not.toThrow();
    });

    it('does not throw when node-notifier callback receives error', () => {
      // Simulate a callback-style error (node-notifier swallows these internally,
      // but we want to ensure our wrapper is robust)
      vi.mocked(notifier.notify).mockImplementation(() => {
        // no-op; simulating silent failure
        return {} as any;
      });

      expect(() => {
        service.notifyPRReadyForReview('Another PR', 'another-project');
      }).not.toThrow();
    });
  });
});
