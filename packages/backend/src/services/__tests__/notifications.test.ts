import { describe, it, expect, beforeEach, vi } from 'vitest';
import notifier from 'node-notifier';
import { NotificationService } from '../notifications.js';

const { notifyMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
}));

vi.mock('node-notifier', () => ({
  default: {
    notify: notifyMock,
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

      expect(notifyMock).toHaveBeenCalledOnce();
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Agent Shepherd',
          message: expect.stringContaining('Fix login bug') as string,
        }),
      );
    });

    it('includes project name in the message', () => {
      service.notifyPRReadyForReview('Add tests', 'cool-project');

      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('cool-project') as string,
        }),
      );
    });

    it('does not throw when node-notifier throws', () => {
      notifyMock.mockImplementation(() => {
        throw new Error('Notification system unavailable');
      });

      expect(() => {
        service.notifyPRReadyForReview('Some PR', 'some-project');
      }).not.toThrow();
    });

    it('does not throw when node-notifier callback receives error', () => {
      notifyMock.mockImplementation(() => {
        return {} as unknown as notifier.NodeNotifier;
      });

      expect(() => {
        service.notifyPRReadyForReview('Another PR', 'another-project');
      }).not.toThrow();
    });
  });
});
