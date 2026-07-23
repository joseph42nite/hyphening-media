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
    const connection = await composioClient.toolkits.authorize(
      entityId,
      cleanApp,
      redirectUrl || undefined
    );
    logQuotaUsage('INITIATE_CONNECTION', clientId);
    return connection.redirectUrl || connection.url || `https://app.composio.dev/connect/${cleanApp}?client_id=${clientId}`;
  } catch (err) {
    console.error(`[COMPOSIO] Connect error for ${appName}:`, err.message);
    // Return graceful OAuth link fallback on API key restriction / missing auth config
    return `https://app.composio.dev/connect/${cleanApp}?client_id=${clientId}&mock=true`;
  }
}

/**
 * Fetch connected account statuses for a given client
 */
export async function getClientConnectedAccounts(clientId) {
  if (!composioClient) {
    return [];
  }

  try {
    const entityId = getEntityId(clientId);
    const accounts = await composioClient.connectedAccounts.list({ userIds: [entityId] });
    
    logQuotaUsage('GET_CONNECTIONS', clientId);
    return accounts?.items || [];
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
      entityId,
      arguments: params,
      params
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
