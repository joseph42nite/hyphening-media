-- Migration: 023_seed_dentalchemy_data.sql
-- Seed DentAlchemy client and marketing content tracker records
INSERT OR IGNORE INTO crm_clients (id, name, client_type) VALUES (3, 'DentAlchemy', 'marketing');

INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-06-25', 'Reel', 'Dent Reel 1', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-06-26', 'Carousel', 'Dent Carousel 1 :5 Common Myths About Teeth Whitening Busted', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-06-27', 'Story', 'Dent Story 1', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-06-28', 'Reel', 'Dent Reel 2', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-01', 'Reel', 'Dent Reel 3', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-02', 'Carousel', 'Dent Carousel 2 : The Right Way to Floss (Step-by-Step Visual Guide)', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-03', 'Story', 'Dent Story 2', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-04', 'Reel', 'Dent Reel 4', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'youtube', '2026-07-05', 'Youtube', 'Dent YouTube 1', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-07', 'Reel', 'Dent Reel 5', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-08', 'Story', 'Dent Story 3', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-09', 'Carousel', 'Dent Carousel 3 : Signs You Might Need a Root Canal Before It’s Too Late', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-10', 'Reel', 'Dent Reel 6', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-13', 'Reel', 'Dent Reel 7', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-14', 'Story', 'Dent Story 4', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-15', 'Carousel', 'Dent Carousel 4 : Clear Aligners vs. Traditional Braces: Which is Best for You?', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-16', 'Reel', 'Dent Reel 8', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-19', 'Reel', 'Dent Reel 9', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-20', 'Story', 'Dent Story 5', 'Pending', 'migration');
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, source) VALUES (3, 'instagram', '2026-07-22', 'Reel', 'Dent Reel 10', 'Pending', 'migration');
