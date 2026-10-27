import type { Loose, NotificationPriority } from './common.js';

export interface Notification {
  Id: number;
  Message?: string;
  DateTime?: string;
  Priority?: Loose<NotificationPriority>;
}

export interface NotifyRequest {
  /** Instance that triggered the notification (max 100 chars). */
  InstanceId: string;
  Title: string;
  /** Max 5000 chars; defaults to Title. */
  Message?: string;
  Priority?: NotificationPriority;
}

export interface NotifyResult {
  NotificationId: number;
}

export interface NotificationWebhook {
  Id: number;
  Name?: string;
  Description?: string;
  Priorities?: Array<Loose<NotificationPriority>>;
  OrganizationIds?: number[];
  Headers?: Array<{ Key: string; Value: string }> | Record<string, string>;
  Url?: string;
  CreatedAt?: string;
  Language?: Loose<'en' | 'de'>;
}

export interface WebhookRequest {
  Name: string;
  Description?: string;
  Priorities: NotificationPriority[];
  OrganizationIds?: number[];
  Headers?: Array<{ Key: string; Value: string }> | Record<string, string>;
  Url?: string;
  Language?: 'en' | 'de';
  [key: string]: unknown;
}
