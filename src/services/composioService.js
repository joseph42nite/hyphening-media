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
  const entity = composioClient.getEntity(entityId);

  const connection = await entity.initiateConnection({
    appName: appName.toLowerCase(),
    redirectUrl: redirectUrl || undefined
  });

  logQuotaUsage('INITIATE_CONNECTION', clientId);
  return connection.redirectUrl;
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
    const entity = composioClient.getEntity(entityId);
    const accounts = await entity.getConnections();
    
    logQuotaUsage('GET_CONNECTIONS', clientId);
    return accounts || [];
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
  const entity = composioClient.getEntity(entityId);

  try {
    const response = await entity.execute({
      actionName,
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
