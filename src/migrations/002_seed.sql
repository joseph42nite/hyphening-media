-- Marketing Ops Center — Seed Data for Development
-- Migration: 002_seed.sql
-- Passwords are bcrypt hashes of the word after "Password: " in each comment

-- ops_video_editor: Password: VideoEditor123!
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'editor@hyphening.com',
  '$2a$12$wApztrzPmSUmfbyNNBW5G.0GZ.6Y5VPOjTh/gEbFCp3cI/7PvfuCy',
  'Video Editor',
  'ops_video_editor'
);

-- ops_social_media_manager: Password: SocialManager123!
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'social@hyphening.com',
  '$2a$12$dT3XjYB9rXnGYK1uHnW7KeaYKfR6vXqW3Zx4YN9mG5pYHVBcN2dNy',
  'Social Media Manager',
  'ops_social_media_manager'
);

