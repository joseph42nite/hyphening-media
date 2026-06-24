/**
 * Marketing Ops Center — Telegram Bot Service
 * Dependency-free service using native global fetch.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const SMM_CHAT_ID = process.env.TELEGRAM_SMM_CHAT_ID;
const VIDEOGRAPHER_CHAT_ID = process.env.TELEGRAM_VIDEOGRAPHER_CHAT_ID;
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';

/**
 * Send a message to a specific Telegram Chat.
 * @param {string|number} chatId - Chat ID to send to
 * @param {string} text - Message text
 * @param {Object} [replyMarkup] - Optional reply keyboard or inline buttons
 */
export async function sendMessage(chatId, text, replyMarkup = null) {
  if (!BOT_TOKEN) {
    console.log(`[TELEGRAM] Bot token not configured. Msg to ${chatId}: ${text}`);
    return null;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.description || 'Failed to send Telegram message');
    }
    return data.result;
  } catch (err) {
    console.error('[TELEGRAM] Send error:', err.message);
    return null;
  }
}

/**
 * Send alert message directly to the Admin.
 */
export async function notifyAdmin(text, replyMarkup = null) {
  if (!ADMIN_CHAT_ID) {
    console.log(`[TELEGRAM] Admin Chat ID not configured. Admin alert: ${text}`);
    return null;
  }
  const footer = `\n\n🔗 Open Dashboard: ${WEBSITE_URL}/dashboard`;
  return sendMessage(ADMIN_CHAT_ID, text + footer, replyMarkup);
}

/**
 * Send message to the Social Media Manager.
 */
export async function notifySMM(text) {
  if (!SMM_CHAT_ID) {
    console.log(`[TELEGRAM] SMM Chat ID not configured. SMM alert: ${text}`);
    return null;
  }
  const footer = `\n\n🔗 Open Dashboard: ${WEBSITE_URL}/dashboard`;
  return sendMessage(SMM_CHAT_ID, text + footer);
}

/**
 * Send message to the Videographer.
 */
export async function notifyVideographer(text) {
  if (!VIDEOGRAPHER_CHAT_ID) {
    console.log(`[TELEGRAM] Videographer Chat ID not configured. Videographer alert: ${text}`);
    return null;
  }
  const footer = `\n\n🔗 Open Dashboard: ${WEBSITE_URL}/dashboard`;
  return sendMessage(VIDEOGRAPHER_CHAT_ID, text + footer);
}

/**
 * Notify assignee by their user role.
 */
export async function notifyAssignee(role, text) {
  if (role === 'ops_video_editor') {
    return notifyVideographer(text);
  } else if (role === 'ops_social_media_manager') {
    return notifySMM(text);
  } else if (role === 'admin' || role === 'super_admin') {
    return notifyAdmin(text);
  }
  return null;
}

/**
 * Send Gig Confirmation Details to an Artist.
 */
export async function sendArtistGigConfirmation(telegramChatId, artistName, gigDate, venueName, address, mapLink, template) {
  if (!telegramChatId) return;

  // Render template simple tags
  let text = template || 'Gig confirmed for {{gig_date}} at {{venue_name}}. Location: {{address}}. Maps: {{map_link}}';
  text = text
    .replace(/{{artist_name}}/g, artistName)
    .replace(/{{gig_date}}/g, gigDate)
    .replace(/{{venue_name}}/g, venueName)
    .replace(/{{address}}/g, address || '')
    .replace(/{{map_link}}/g, mapLink || '');

  return sendMessage(telegramChatId, text);
}

