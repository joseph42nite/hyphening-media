-- Marketing Ops Center — Seed Data for Development
-- Migration: 002_seed.sql

INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'editor@hyphening.com',
  '$2a$12$Rr8lgeutS.83rqC0R3YhjeAOp52Es/8PSPtHp0IJ7pNXdRI5sx1Ki',
  'Video Editor',
  'ops_video_editor'
);

INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'social@hyphening.com',
  '$2a$12$soVThyCnic35pQGPUgBLX.Epcy8pMrBVoyByJlSyZfPhxBebkX/zS',
  'Social Media Manager',
  'ops_social_media_manager'
);


