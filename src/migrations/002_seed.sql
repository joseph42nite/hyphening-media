-- Marketing Ops Center — Seed Data for Development
-- Migration: 002_seed.sql
-- Passwords are bcrypt hashes of the word after "Password: " in each comment

-- admin: Password: Admin123!
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'admin@hyphening.com',
  '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Jomy George',
  'admin'
);

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

-- Sample clients
INSERT OR IGNORE INTO crm_clients (name, client_type, contact_person, contact_email) VALUES
  ('Artisan Coffee Co.', 'marketing', 'Rahul Sharma', 'rahul@artisancoffee.in'),
  ('The Jazz Lounge', 'both', 'Priya Nair', 'priya@jazzlounge.in'),
  ('Digital Nomad Studios', 'marketing', 'Arjun Mehta', 'arjun@dnstudios.in');

-- Sample freelancers
INSERT OR IGNORE INTO freelancers (name, email, phone, specialization, rate_per_video) VALUES
  ('Vikram Desai', 'vikram@freelance.dev', '+91-9876543210', 'Video Editing', 5000),
  ('Ananya Iyer', 'ananya@freelance.dev', '+91-9876543211', 'Motion Graphics', 7500),
  ('Karthik Rajan', 'karthik@freelance.dev', '+91-9876543212', 'Color Grading', 4000);

-- Sample venues
INSERT OR IGNORE INTO venues (name, address, city, map_link, poc_name, poc_phone, gig_confirmed_message) VALUES
  ('Blue Frog Lounge', 'Mathuradas Mill Compound, Lower Parel', 'Mumbai', 'https://maps.google.com/?q=Blue+Frog+Mumbai', 'Sanjay', '+91-9800000001', 'Hey {{artist_name}}! Your gig at Blue Frog is confirmed for {{gig_date}}. Please arrive by 7 PM for sound check. Address: {{address}}. Maps: {{map_link}}'),
  ('The Piano Man Jazz Club', 'B-6/7, Safdarjung Enclave Market', 'Delhi', 'https://maps.google.com/?q=Piano+Man+Delhi', 'Neha', '+91-9800000002', 'Hi {{artist_name}}! Confirmed: {{gig_date}} at The Piano Man. Doors open 8 PM, your set is at 9:30 PM. Location: {{address}} — {{map_link}}');
