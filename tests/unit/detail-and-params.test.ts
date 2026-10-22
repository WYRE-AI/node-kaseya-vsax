import { describe, expect, it } from 'vitest';
import { KaseyaVsaxError, MAX_ERROR_BODY_LENGTH } from '../../src/index.js';
import { TOKEN_ID, TOKEN_SECRET, makeClient, newFetch, res } from '../helpers.js';

describe('KaseyaVsaxError.detail', () => {
  it('holds the upstream text without a status prefix', async () => {
    const f = newFetch().mockResolvedValue(res(400, { Message: 'Name is required' }));
    const { client } = makeClient(f);
    const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxError;
    expect(err.message).toBe('Bad request (400): Name is required');
    expect(err.detail).toBe('Name is required');
  });

  it('is scrubbed of secrets and truncated', async () => {
    const body = { Message: `bad ${TOKEN_ID} ${TOKEN_SECRET} Authorization: Basic abc ${'x'.repeat(2000)}` };
    for (const status of [400, 401, 403, 404, 500]) {
      const f = newFetch().mockResolvedValue(res(status, body));
      const { client } = makeClient(f);
      const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxError;
      expect(err.detail).toBeDefined();
      expect(err.detail).not.toContain(TOKEN_ID);
      expect(err.detail).not.toContain(TOKEN_SECRET);
      expect(err.detail).not.toContain('Authorization');
      expect(err.detail?.length).toBeLessThanOrEqual(MAX_ERROR_BODY_LENGTH + 20);
    }
  });

  it('is absent when the body is empty', async () => {
    const f = newFetch().mockResolvedValue(res(404));
    const { client } = makeClient(f);
    const err = (await client.devices.get('x').catch((e: unknown) => e)) as KaseyaVsaxError;
    expect(err.detail).toBeUndefined();
  });
});

describe('path parameter names', () => {
  type Client = ReturnType<typeof makeClient>['client'];
  const cases: [string, (c: Client) => Promise<unknown>, string][] = [
    ['devices.get', (c: Client): Promise<unknown> => c.devices.get(''), 'deviceId'],
    ['devices.notifications', (c: Client): Promise<unknown> => c.devices.notifications(''), 'deviceId'],
    ['devices.customFields', (c: Client): Promise<unknown> => c.devices.customFields(''), 'deviceId'],
    ['devices.appliedPolicies', (c: Client): Promise<unknown> => c.devices.appliedPolicies(''), 'deviceId'],
    ['assets.get', (c: Client): Promise<unknown> => c.assets.get(''), 'deviceId'],
    ['sites.get', (c: Client): Promise<unknown> => c.sites.get(''), 'siteId'],
    ['groups.get', (c: Client): Promise<unknown> => c.groups.get(''), 'groupId'],
    ['organizations.get', (c: Client): Promise<unknown> => c.organizations.get(''), 'organizationId'],
    ['scripts.get', (c: Client): Promise<unknown> => c.automation.scripts.get(''), 'scriptId'],
    ['scripts.run', (c: Client): Promise<unknown> => c.automation.scripts.run('', {} as never), 'scriptId'],
    ['tasks.get', (c: Client): Promise<unknown> => c.automation.tasks.get(''), 'taskId'],
    ['tasks.run', (c: Client): Promise<unknown> => c.automation.tasks.run(''), 'taskId'],
    ['workflows.get', (c: Client): Promise<unknown> => c.automation.workflows.get(''), 'workflowId'],
    ['workflows.run', (c: Client): Promise<unknown> => c.automation.workflows.run(''), 'workflowId'],
    ['notifications.get', (c: Client): Promise<unknown> => c.notifications.get(''), 'notificationId'],
    ['notifications.delete', (c: Client): Promise<unknown> => c.notifications.delete(''), 'notificationId'],
    ['webhooks.get', (c: Client): Promise<unknown> => c.notifications.webhooks.get(''), 'webhookId'],
    ['webhooks.delete', (c: Client): Promise<unknown> => c.notifications.webhooks.delete(''), 'webhookId'],
    ['webhooks.regenerateSecret', (c: Client): Promise<unknown> => c.notifications.webhooks.regenerateSecret(''), 'webhookId'],
    ['customFields.get', (c: Client): Promise<unknown> => c.customFields.get(''), 'customFieldId'],
    ['customFields.usage', (c: Client): Promise<unknown> => c.customFields.usage(''), 'customFieldId'],
    ['scopes.get', (c: Client): Promise<unknown> => c.scopes.get(''), 'scopeId'],
    ['scopes.usage', (c: Client): Promise<unknown> => c.scopes.usage(''), 'scopeId'],
    ['patchManagement.getPolicy', (c: Client): Promise<unknown> => c.patchManagement.getPolicy(''), 'policyId'],
    ['endpointProtection.getPolicy', (c: Client): Promise<unknown> => c.endpointProtection.getPolicy(''), 'policyId'],
  ];

  it.each(cases)('%s names %s in INVALID_PATH_PARAM', async (_n, fn, name) => {
    const f = newFetch();
    const { client } = makeClient(f);
    const err = (await fn(client).catch((e: unknown) => e)) as KaseyaVsaxError;
    expect(err.code).toBe('INVALID_PATH_PARAM');
    expect(err.message).toContain(`"${name}"`);
    expect(f).not.toHaveBeenCalled();
  });
});
