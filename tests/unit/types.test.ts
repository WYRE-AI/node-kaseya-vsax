import { describe, expect, it } from 'vitest';
import type { CustomField, Organization } from '../../src/index.js';
import { makeClient, newFetch, ok } from '../helpers.js';

describe('response types match live API keys', () => {
  it('organizations.get reads lowercase type and PsaMappingType', async () => {
    const f = newFetch();
    f.mockResolvedValue(
      ok({
        Id: 1,
        Name: 'Acme',
        type: 'Customer',
        HasCustomFields: true,
        PsaMappingType: 'Company',
        PsaIntegrationType: null,
        PsaQueueName: 'Q',
        PsaNotificationType: 'N',
        Access: [{ TeamName: 'T', AccessLevel: 'FullAccess' }],
      }),
    );
    const { client } = makeClient(f);
    const result = await client.organizations.get(1);
    expect(result.type).toBe('Customer');
    expect(result.PsaMappingType).toBe('Company');

    const org: Organization = result;
    // @ts-expect-error Organization no longer has `Type`
    expect(org.Type).toBeUndefined();
    // @ts-expect-error Organization no longer has `PsaMappingId`
    expect(org.PsaMappingId).toBeUndefined();
  });

  it('groups.get reads PsaMappingType', async () => {
    const f = newFetch();
    f.mockResolvedValue(
      ok({
        IsActive: true,
        Id: 3,
        Name: 'G',
        ParentSiteId: 2,
        ParentSiteName: 'S',
        ParentOrganizationId: 1,
        ParentOrganizationName: 'Acme',
        Notes: 'n',
        HasCustomFields: false,
        PsaMappingId: 9,
        PsaMappingType: 'Location',
        PsaIntegrationType: null,
        Packages: [],
      }),
    );
    const { client } = makeClient(f);
    const result = await client.groups.get(3);
    expect(result.PsaMappingType).toBe('Location');
  });

  it('customFields.list reads Contexts', async () => {
    const f = newFetch();
    f.mockResolvedValue(
      ok([
        {
          Id: 5,
          Name: 'CF',
          Description: 'd',
          Type: 'Text',
          DefaultValue: 'x',
          GlobalValue: 'y',
          IsReadOnly: false,
          Contexts: ['Device', 'Site'],
          ExpirationDate: '2030-01-01T00:00:00Z',
          CreatedAt: '2024-01-01T00:00:00Z',
        },
      ]),
    );
    const { client } = makeClient(f);
    const [field] = await client.customFields.list();
    expect(field?.Contexts).toEqual(['Device', 'Site']);

    const cf: CustomField | undefined = field;
    // @ts-expect-error CustomField no longer has `Context`
    expect(cf?.Context).toBeUndefined();
  });
});
