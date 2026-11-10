/** Labels, the Gmail compose link and backlink gap lines for the Outreach section (Manual tasks tab) and the SEO Monitor. */

export const KIND_LABEL = { broken_link: 'Broken link', competitor_gap: 'Competitor gap', mention: 'Mention' };

export const STATUS_LABEL = {
  to_approve: 'To approve', follow_up_to_approve: 'Follow-up to approve', to_send: 'To send', follow_up_to_send: 'Follow-up to send',
  sent: 'Sent, waiting', replied: 'Replied', won: 'Won', lost: 'Lost', rejected: 'Rejected',
};

/** The four views, by status. */
export const VIEWS = [
  { id: 'approve', label: 'To approve', statuses: ['to_approve', 'follow_up_to_approve'] },
  { id: 'send', label: 'To send', statuses: ['to_send', 'follow_up_to_send'] },
  { id: 'waiting', label: 'Waiting', statuses: ['sent', 'replied'] },
  { id: 'done', label: 'Done', statuses: ['won', 'lost'] },
];

/**
 * A new Gmail message in the signed-in account, with To, CC, subject and body
 * filled in. Gmail adds the sender's signature; closing it unsent keeps it as
 * a draft. Nothing is sent by the portal.
 */
export function gmailComposeUrl(p) {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: p.contact_email || '', su: p.email_subject || '', body: p.email_body || '' });
  if (p.email_cc) q.set('cc', p.email_cc);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** "10 Nov" from a server timestamp (UTC, "YYYY-MM-DD HH:MM:SS"). */
export function gapDay(ts) {
  const d = new Date(`${String(ts).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? String(ts).slice(0, 10) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** One line for a competitor's latest backlink gap report, or null when none has run. */
export function gapSummary(gap) {
  if (!gap) return null;
  const parts = [`Gap checked ${gapDay(gap.checkedAt)}`];
  if (gap.untyped) parts.push(`${gap.untyped} domains not sorted (re-run to sort)`);
  else parts.push(`${gap.directories} directories`, `${gap.news_pr} PR`, `${gap.outreach} for outreach`);
  return parts.join(' · ');
}
