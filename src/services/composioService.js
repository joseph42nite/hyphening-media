import { Composio } from '@composio/core';
import db from '../../database.js';

const composioApiKey = process.env.COMPOSIO_API_KEY || '';
const composioClient = composioApiKey ? new Composio({ apiKey: composioApiKey }) : null;

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
    // 1. Fetch auth configs for this toolkit
    let authConfigId;
    try {
      const configs = await composioClient.authConfigs.list({ toolkit: cleanApp });
      if (configs?.items && configs.items.length > 0) {
        authConfigId = configs.items[0].id;
      }
    } catch (e) {
      console.warn(`[COMPOSIO] Could not list authConfigs for ${cleanApp}:`, e.message);
    }

    // 2. Direct user link generation
    if (authConfigId) {
      const link = await composioClient.connectedAccounts.link(entityId, authConfigId, {
        callbackUrl: redirectUrl || undefined
      });
      logQuotaUsage('INITIATE_CONNECTION', clientId);
      return link.redirectUrl || link.url;
    } else {
      const connection = await composioClient.toolkits.authorize(entityId, cleanApp, redirectUrl || undefined);
      logQuotaUsage('INITIATE_CONNECTION', clientId);
      return connection.redirectUrl || connection.url;
    }
  } catch (err) {
    console.error(`[COMPOSIO] Connect error for ${appName}:`, err.message);
    return `https://app.composio.dev/connect/${cleanApp}?client_id=${clientId}&mock=true`;
  }
}

/**
 * Fetch connected account statuses for a given client.
 * Searches by userId first, then falls back to listing all active accounts
 * since Composio may not always set userId on connections made via link flow.
 */
export async function getClientConnectedAccounts(clientId) {
  if (!composioClient) {
    return [];
  }

  try {
    const entityId = getEntityId(clientId);

    // Try fetching by userId first
    let accounts;
    try {
      const result = await composioClient.connectedAccounts.list({ userIds: [entityId] });
      accounts = result?.items || [];
    } catch (e) {
      console.warn(`[COMPOSIO] userId lookup failed for ${entityId}:`, e.message);
      accounts = [];
    }

    // If no userId-linked accounts found, fetch all active and return them
    // (for projects with a single client or newly connected accounts)
    if (accounts.length === 0) {
      try {
        const allResult = await composioClient.connectedAccounts.list({
          statuses: ['ACTIVE']
        });
        accounts = allResult?.items || [];
      } catch (e) {
        console.warn('[COMPOSIO] Fallback list failed:', e.message);
      }
    }

    // Normalize: SDK v0.13 uses toolkit.slug instead of appName
    const normalized = accounts.map(acc => ({
      ...acc,
      appName: acc.appName || acc.toolkit?.slug || 'unknown',
      accountName: acc.alias || acc.wordId || null
    }));

    logQuotaUsage('GET_CONNECTIONS', clientId);
    return normalized;
  } catch (err) {
    console.error(`[COMPOSIO] Failed to get connections for client ${clientId}:`, err.message);
    return [];
  }
}

/**
 * Find the first ACTIVE connected account for a given toolkit slug.
 * Used by executeClientAction to find the right connection.
 */
async function findActiveConnection(toolkitSlug) {
  if (!composioClient) return null;
  try {
    const result = await composioClient.connectedAccounts.list({
      statuses: ['ACTIVE']
    });
    return (result?.items || []).find(
      a => (a.toolkit?.slug || '').toLowerCase() === toolkitSlug.toLowerCase()
    );
  } catch (e) {
    console.warn(`[COMPOSIO] findActiveConnection error:`, e.message);
    return null;
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

  // Determine which toolkit this action belongs to
  const toolkitSlug = actionName.toLowerCase().startsWith('youtube') ? 'youtube'
    : actionName.toLowerCase().startsWith('instagram') ? 'instagram'
    : actionName.toLowerCase().startsWith('facebook') ? 'facebook'
    : null;

  // Find the active connected account for this toolkit
  let connectedAccountId;
  if (toolkitSlug) {
    const conn = await findActiveConnection(toolkitSlug);
    if (conn) {
      connectedAccountId = conn.id;
    }
  }

  try {
    const executeParams = {
      connectedAccountId,
      entityId,
      ...params
    };

    const response = await composioClient.tools.execute(actionName, executeParams);

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
