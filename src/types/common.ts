/** Shared type aliases. */

/** Loose JSON object for sections the docs describe only as "object". */
export type JsonObject = Record<string, unknown>;

export type NotificationPriority = 'Low' | 'Normal' | 'Elevated' | 'Critical';

export type CustomFieldContextType = 'Organization' | 'Site' | 'Group' | 'Device';

/** Union of known literals that still accepts any other string the server may add. */
export type Loose<T extends string> = T | (string & Record<never, never>);
