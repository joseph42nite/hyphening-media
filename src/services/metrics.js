/**
 * Compute derived metrics for a content row.
 */
export function computeContentMetrics(row) {
  const { views, likes, comments, shares, saves, avg_watch_time_pct } = row;

  let engagement_rate_pct = null;
  let save_rate_pct = null;
  let skip_rate_pct = null;
  let content_score = null;

  if (views && views > 0) {
    engagement_rate_pct = ((likes + comments + shares + saves) / views) * 100;
    save_rate_pct = (saves / views) * 100;
  }

  if (avg_watch_time_pct !== null && avg_watch_time_pct !== undefined) {
    skip_rate_pct = 100 - avg_watch_time_pct;
  }

  if (engagement_rate_pct !== null && save_rate_pct !== null && avg_watch_time_pct !== null) {
    const rawScore = (engagement_rate_pct * 0.3) + (save_rate_pct * 2.5) + (avg_watch_time_pct * 0.45);
    content_score = Math.round(rawScore * 10) / 10;
  }

  return {
    engagement_rate_pct: engagement_rate_pct !== null ? Math.round(engagement_rate_pct * 100) / 100 : null,
    save_rate_pct: save_rate_pct !== null ? Math.round(save_rate_pct * 100) / 100 : null,
    skip_rate_pct: skip_rate_pct !== null ? Math.round(skip_rate_pct * 100) / 100 : null,
    content_score,
  };
}

/**
 * Compute derived metrics for an ad campaign row.
 */
export function computeAdMetrics(row) {
  const { impressions, clicks, total_ad_spend_inr, leads, revenue_generated } = row;

  return {
    ctr_pct: impressions > 0 ? Math.round((clicks / impressions) * 100 * 100) / 100 : null,
    cpc_inr: clicks > 0 ? Math.round(total_ad_spend_inr / clicks) : null,
    cpl_inr: leads > 0 ? Math.round(total_ad_spend_inr / leads) : null,
    roas: total_ad_spend_inr > 0 ? Math.round((revenue_generated / total_ad_spend_inr) * 100) / 100 : null,
  };
}
