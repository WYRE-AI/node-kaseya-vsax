import { pathParam } from '../http.js';
import type { ListParams, PaginatedIterable } from '../pagination.js';
import type {
  Notification,
  NotificationWebhook,
  NotifyRequest,
  NotifyResult,
  WebhookRequest,
} from '../types/index.js';
import { BaseResource } from './base.js';

/** Notifications and notification webhooks (`/notifications`). */
export class NotificationsResource extends BaseResource {
  /** List notifications (single page). */
  async list(params?: ListParams): Promise<Notification[]> {
    return this.getList<Notification>('/notifications', params);
  }

  /** Iterate over all notifications across pages. */
  listAll(params?: ListParams): PaginatedIterable<Notification> {
    return this.iterate<Notification>('/notifications', params);
  }

  /** Get a notification. */
  async get(id: number | string): Promise<Notification> {
    return this.http.request<Notification>('GET', `/notifications/${pathParam(id, 'notificationId')}`);
  }

  /** Send a notification. WRITE operation. */
  async notify(request: NotifyRequest): Promise<NotifyResult> {
    return this.http.request<NotifyResult>('POST', '/notifications', { body: request });
  }

  /** Delete a notification. WRITE operation. */
  async delete(id: number | string): Promise<void> {
    return this.http.request<void>('DELETE', `/notifications/${pathParam(id, 'notificationId')}`);
  }

  readonly webhooks = {
    list: async (params?: ListParams): Promise<NotificationWebhook[]> =>
      this.getList<NotificationWebhook>('/notifications/webhooks', params),
    listAll: (params?: ListParams): PaginatedIterable<NotificationWebhook> =>
      this.iterate<NotificationWebhook>('/notifications/webhooks', params),
    get: async (id: number | string): Promise<NotificationWebhook> =>
      this.http.request<NotificationWebhook>('GET', `/notifications/webhooks/${pathParam(id, 'webhookId')}`),
    /** WRITE operation. */
    create: async (request: WebhookRequest): Promise<NotificationWebhook> =>
      this.http.request<NotificationWebhook>('POST', '/notifications/webhooks', { body: request }),
    /** WRITE operation. */
    update: async (id: number | string, request: WebhookRequest): Promise<NotificationWebhook> =>
      this.http.request<NotificationWebhook>('PUT', `/notifications/webhooks/${pathParam(id, 'webhookId')}`, {
        body: request,
      }),
    /** WRITE operation. */
    delete: async (id: number | string): Promise<void> =>
      this.http.request<void>('DELETE', `/notifications/webhooks/${pathParam(id, 'webhookId')}`),
    /** Re-generate the webhook secret key. WRITE operation. */
    regenerateSecret: async (id: number | string): Promise<NotificationWebhook> =>
      this.http.request<NotificationWebhook>(
        'POST',
        `/notifications/webhooks/${pathParam(id, 'webhookId')}/regeneratesecretkey`,
      ),
  };
}
