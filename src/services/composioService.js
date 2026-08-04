import { Composio } from '@composio/core';
import db from '../../database.js';

const composioApiKey = process.env.COMPOSIO_API_KEY || '';
const composioClient = composioApiKey ? new Composio({ 
  apiKey: composioApiKey,
  dangerouslySkipVersionCheck: true 
}) : null;

/**
 * Format client entity ID for Composio
 * E.g., client_id 12 => 'hyphening_client_12'
 */
export function getEntityId(clientId) {
  return `hyphening_client_${clientId}`;
}

/**
 * Log Composio API action to quota management table
 */
export function logQuotaUsage(actionName, clientId = null, remainingQuota = null) {
  try {
    db.prepare(`
      INSERT INTO sys_composio_quota_logs (action_name, client_id, remaining_quota)
      VALUES (?, ?, ?)
    `).run(actionName, clientId, remainingQuota);
  } catch (err) {
    console.error('[COMPOSIO] Quota log error:', err.message);
  }
}

/**
 * Generate OAuth initiation URL for a client & app
 */
export async function getConnectUrl(clientId, appName, redirectUrl = '') {
  if (!composioClient) {
    console.log(`[COMPOSIO] [MOCK] Generating mock connect URL for ${appName} (Set COMPOSIO_API_KEY for live OAuth).`);
    return `https://app.composio.dev/connect/${appName.toLowerCase()}?client_id=${clientId}&mock=true`;
  }

  const entityId = getEntityId(clientId);
  const cleanApp = appName.toLowerCase();

  try {
    // 1. Fetch existing auth configs
    let authConfigId;
    try {
      const configs = await composioClient.authConfigs.list({});
      const match = configs?.items?.find(c => 
        c.toolkit?.slug?.toLowerCase() === cleanApp || 
        c.name?.toLowerCase().includes(cleanApp)
      );
      if (match) {
        authConfigId = match.id;
      }
    } catch (e) {
      console.warn(`[COMPOSIO] Could not list authConfigs:`, e.message);
    }

    // 2. If no authConfig exists, create one for this toolkit.
    // Note: authConfigs.create takes the toolkit slug as a positional string,
    // not as an options field.
    if (!authConfigId) {
      const created = await composioClient.authConfigs.create(cleanApp, {
        type: 'use_composio_managed_auth',
        name: `${cleanApp} Auth Config`
      });
      authConfigId = created.id;
    }

    // 3. Generate OAuth connection link via connectedAccounts.link
    if (authConfigId) {
      const link = await composioClient.connectedAccounts.link(entityId, authConfigId, {
        allowMultiple: true,
        callbackUrl: redirectUrl || undefined
      });
      logQuotaUsage('INITIATE_CONNECTION', clientId);
      return link.redirectUrl || link.url;
    } else {
      throw new Error(`No authConfig found or created for ${cleanApp}`);
    }
  } catch (err) {
    console.error(`[COMPOSIO] Connect error for ${appName}:`, err.message);
    throw new Error(`Failed to generate ${appName} connection link: ${err.message}`);
  }
}

/**
 * Fetch connected account statuses for a given client entity.
 * Only returns active connections strictly associated with this client's entityId.
 */
export async function getClientConnectedAccounts(clientId) {
  if (!composioClient) {
    return [];
  }

  try {
    const entityId = getEntityId(clientId);
    const result = await composioClient.connectedAccounts.list({
      userIds: [entityId],
      statuses: ['ACTIVE']
    });

    const accounts = result?.items || [];

    // Normalize: SDK v0.13 uses toolkit.slug instead of appName
    const normalized = accounts.map(acc => ({
      ...acc,
      appName: acc.appName || acc.toolkit?.slug || 'unknown',
      accountName: acc.alias || acc.data?.username || null
    }));

    logQuotaUsage('GET_CONNECTIONS', clientId);
    return normalized;
  } catch (err) {
    console.error(`[COMPOSIO] Failed to get connections for client ${clientId}:`, err.message);
    return [];
  }
}

/**
 * Execute a platform action (e.g. upload video, post reel, reply comment)
 */
export async function executeClientAction(clientId, actionName, params = {}) {
  if (!composioClient) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }

  const entityId = getEntityId(clientId);

  try {
    const response = await composioClient.tools.execute(actionName, {
      userId: entityId,
      arguments: params,
      dangerouslySkipVersionCheck: true
    });

    logQuotaUsage(actionName, clientId);
    return response;
  } catch (err) {
    console.error(`[COMPOSIO] Execution failed (${actionName}) for client ${clientId}:`, err.message);
    throw err;
  }
}

export default {
  getEntityId,
  getConnectUrl,
  getClientConnectedAccounts,
  executeClientAction,
  logQuotaUsage
};
