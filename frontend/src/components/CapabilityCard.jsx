import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * Standardized reusable card for the Nine Pillars / Capabilities.
 * Eliminates code duplication across listing views, dashboard previews, and landing components.
 */
export default function CapabilityCard({ pillar, className = '', onClick }) {
  if (!pillar) return null;

  return (
    <Link
      to={`/capabilities/${pillar.slug}`}
      className={`capability-listing-card ${className}`.trim()}
      onClick={onClick}
    >
      <div className="capability-card-img-wrap">
        <img
          src={pillar.image}
          alt={pillar.title}
          className="capability-card-img"
          loading="lazy"
        />
        <div className="capability-card-overlay" />
        <span className="capability-card-badge">{pillar.number}</span>
        <span className="capability-card-kanji">{pillar.kanji}</span>
        <span className="capability-card-arrow">
          <ArrowRight size={16} />
        </span>
      </div>

      <div className="capability-card-content">
        <div className="capability-card-top">
          <span className="capability-card-tag">Pillar {pillar.number}</span>
          <span className="capability-card-romaji">{pillar.kanjiRomaji}</span>
        </div>
        <h3 className="capability-card-title">{pillar.title}</h3>
        <p className="capability-card-desc">{pillar.summary}</p>

        <div className="capability-card-footer">
          <span className="capability-card-link-text">
            Explore Discipline
          </span>
          <ArrowRight size={14} className="capability-card-footer-icon" />
        </div>
      </div>
    </Link>
  );
}
