/**
 * Marketing Ops Center — Telegram Bot Service
 * Dependency-free service using native global fetch.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

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
  return sendMessage(ADMIN_CHAT_ID, text, replyMarkup);
}

/**
 * Send Planning Cycle approval card to Admin.
 */
export async function sendCycleApprovalCard(cycle, gigs) {
  const text = `
*Curation Planning Cycle Pending Approval*
Cycle: _${cycle.cycle_label}_
Date Range: _${cycle.start_date}_ to _${cycle.end_date}_
Total Gigs Assigned: *${gigs.length}*

Click approve below to confirm assignments and dispatch emails to artists.
  `.trim();

  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: '✅ Approve Cycle',
          callback_data: `approve_cycle:${cycle.id}`
        }
      ]
    ]
  };

  return notifyAdmin(text, inlineKeyboard);
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
