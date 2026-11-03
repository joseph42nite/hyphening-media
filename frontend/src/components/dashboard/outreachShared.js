/** Labels and the Gmail compose link for the SEO Monitor's Outreach section. */

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
