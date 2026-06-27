import db from '../database.js';

function recalculateRollups(artistId) {
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status != 'Cancelled' THEN 1 ELSE 0 END) as total_gigs,
      SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_gigs,
      SUM(CASE WHEN status = 'Pending' OR status = 'Advance Paid' THEN 1 ELSE 0 END) as pending_gigs,
      ROUND(AVG(CASE WHEN status = 'Paid' THEN fee_inr END), 0) as average_fee_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN fee_inr ELSE 0 END), 0) as total_amount_paid_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' OR status = 'Cancelled' THEN 0 ELSE fee_inr - advance_paid END), 0) as total_amount_pending_inr,
      MAX(CASE WHEN status != 'Cancelled' THEN gig_date END) as latest_gig_date
    FROM gig_status 
    WHERE artist_id = ?
  `).get(artistId);

  let reliability_score = null;
  if (stats.total_gigs > 0) {
    reliability_score = Math.round((stats.paid_gigs / stats.total_gigs) * 100);
  }

  let payment_status = 'No Records';
  if (stats.total_gigs > 0) {
    payment_status = stats.pending_gigs > 0 ? '⚠ Pending' : '✅ All Paid';
  }

  // Format last_perf_date like DD-MMM-YYYY
  let last_perf_date = 'No gigs yet';
  if (stats.latest_gig_date) {
    const d = new Date(stats.latest_gig_date + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    last_perf_date = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  db.prepare(`
    UPDATE artists SET 
      total_performances = ?, average_fee_inr = ?, total_amount_paid_inr = ?,
      total_amount_pending_inr = ?, payment_status = ?, reliability_score = ?, perf_with_m = ?,
      last_perf_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    stats.total_gigs, stats.average_fee_inr || 0, stats.total_amount_paid_inr,
    stats.total_amount_pending_inr, payment_status, reliability_score, stats.paid_gigs || 0,
    last_perf_date, new Date().toISOString(), artistId
  );
}

// Recalculate for all artists
const artists = db.prepare('SELECT id, name FROM artists').all();
console.log(`Recalculating rollups for ${artists.length} artists...`);
for (const artist of artists) {
  recalculateRollups(artist.id);
  console.log(`✓ Recalculated for: ${artist.name}`);
}
console.log('All artist rollups updated successfully!');
