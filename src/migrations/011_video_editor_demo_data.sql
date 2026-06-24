-- Migration: 011_video_editor_demo_data.sql
-- Populate demo data for video editor role testing.
-- Assigns video editing tasks to user id=2 (Video Editor) across multiple clients.
-- Also adds video-type marketing content (Reels, YouTube, Shorts) to test calendar & content visibility.

-- ============================================================
-- VIDEO TASKS ASSIGNED TO VIDEO EDITOR (user id=2)
-- ============================================================

-- Client 1: Artisan Coffee Co.
INSERT INTO kanban_tasks (client_id, title, description, priority, task_type, assigned_to, due_date, status, created_by)
VALUES
  (1, 'Latte Art Tutorial — Reel Edit', 'Edit 60-second Reel showcasing barista latte art techniques. Raw footage on Google Drive.', 'high', 'video', 2, '2026-06-28', 'in_progress', 1),
  (1, 'Morning Brew Routine — YouTube Short', 'Cut 30-sec YouTube Short from morning café footage. Add text overlays and trending audio.', 'medium', 'video', 2, '2026-06-30', 'todo', 1),
  (1, 'Coffee Origins Documentary — Long Form', 'Full 8-minute YouTube video about single-origin beans. Colour grade + motion graphics.', 'urgent', 'video', 2, '2026-07-05', 'review', 1),
  (1, 'Espresso Machine Unboxing — Reel', 'Quick unboxing video for new La Marzocca machine. Vertical format, 45 seconds.', 'low', 'video', 2, '2026-07-10', 'backlog', 1);

-- Client 2: The Jazz Lounge
INSERT INTO kanban_tasks (client_id, title, description, priority, task_type, assigned_to, due_date, status, created_by)
VALUES
  (2, 'Live Jazz Night Recap — Reel', 'Edit highlight reel from last Friday jazz night. Include crowd shots + performance clips.', 'high', 'video', 2, '2026-06-26', 'in_progress', 1),
  (2, 'Artist Spotlight: Meera Shankar — YouTube', '5-minute interview + performance edit. Add lower thirds and intro animation.', 'medium', 'video', 2, '2026-07-02', 'todo', 1),
  (2, 'Open Mic Night Promo — Short', '15-sec teaser for upcoming open mic. Fast cuts, energetic transitions.', 'high', 'video', 2, '2026-06-25', 'revision', 1);

-- Client 3: Digital Nomad Studios  
INSERT INTO kanban_tasks (client_id, title, description, priority, task_type, assigned_to, due_date, status, created_by)
VALUES
  (3, 'Co-Working Space Tour — YouTube', 'Full walkthrough video of the new studio space. 3 minutes with voiceover.', 'medium', 'video', 2, '2026-07-08', 'todo', 1),
  (3, 'Remote Work Tips — Reel Series #1', 'First in a series of 5 Reels about productivity tips. 30 seconds each.', 'medium', 'video', 2, '2026-07-01', 'backlog', 1);

-- ============================================================
-- MARKETING CONTENT (Reels, YouTube, Shorts) — video types visible to editor
-- ============================================================

-- Client 1: Artisan Coffee Co. — June 2026
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, views, likes, comments, shares, saves, source)
VALUES
  (1, 'instagram', '2026-06-20', 'Reel', 'Latte Art in Slow Motion', 'Posted', 45200, 3100, 187, 412, 890, 'manual'),
  (1, 'instagram', '2026-06-22', 'Reel', 'Pour Over vs French Press', 'Posted', 32100, 2400, 95, 310, 620, 'manual'),
  (1, 'youtube',   '2026-06-18', 'Youtube', 'The Perfect Espresso — Full Guide', 'Posted', 12800, 890, 67, 124, 340, 'manual'),
  (1, 'youtube',   '2026-06-25', 'Short', 'Quick Cold Brew Hack', 'Draft', 0, 0, 0, 0, 0, 'manual'),
  (1, 'instagram', '2026-06-28', 'Reel', 'Latte Art Tutorial', 'Pending Client Approval', 0, 0, 0, 0, 0, 'manual'),
  (1, 'youtube',   '2026-06-30', 'Youtube', 'Morning Brew Routine', 'Draft', 0, 0, 0, 0, 0, 'manual');

-- Client 2: The Jazz Lounge — June 2026
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, views, likes, comments, shares, saves, source)
VALUES
  (2, 'instagram', '2026-06-19', 'Reel', 'Friday Jazz Night Highlights', 'Posted', 28500, 2100, 143, 289, 510, 'manual'),
  (2, 'instagram', '2026-06-23', 'Reel', 'Saxophone Solo — Meera Shankar', 'Posted', 51300, 4200, 310, 890, 1200, 'manual'),
  (2, 'youtube',   '2026-06-26', 'Youtube', 'Artist Spotlight: Meera Shankar', 'Pending Client Approval', 0, 0, 0, 0, 0, 'manual'),
  (2, 'youtube',   '2026-06-24', 'Short', 'Open Mic Night Teaser', 'Draft', 0, 0, 0, 0, 0, 'manual');

-- Client 3: Digital Nomad Studios — June/July 2026
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, views, likes, comments, shares, saves, source)
VALUES
  (3, 'instagram', '2026-06-21', 'Reel', 'Day in the Life at DN Studios', 'Posted', 19800, 1450, 78, 195, 380, 'manual'),
  (3, 'youtube',   '2026-07-01', 'Youtube', 'Co-Working Space Tour', 'Draft', 0, 0, 0, 0, 0, 'manual'),
  (3, 'instagram', '2026-07-02', 'Reel', 'Remote Work Tips #1', 'Draft', 0, 0, 0, 0, 0, 'manual');

-- Also add a few non-video content types to verify filtering works (video editor should NOT see these)
INSERT INTO marketing_content_tracker (client_id, platform, date, post_type, title, status, views, likes, comments, shares, saves, source)
VALUES
  (1, 'instagram', '2026-06-21', 'Static', 'New Summer Menu Announcement', 'Posted', 8900, 560, 34, 45, 120, 'manual'),
  (1, 'instagram', '2026-06-24', 'Carousel', 'Coffee Bean Origins — 5 Slides', 'Posted', 6200, 410, 28, 38, 90, 'manual'),
  (1, 'instagram', '2026-06-27', 'Story', 'Behind the Counter Monday', 'Posted', 3400, 0, 0, 0, 0, 'manual'),
  (2, 'instagram', '2026-06-22', 'Static', 'Next Week Lineup Poster', 'Posted', 4100, 280, 15, 22, 55, 'manual'),
  (2, 'instagram', '2026-06-25', 'Carousel', 'Jazz History — 4 Part Series', 'Pending Client Approval', 0, 0, 0, 0, 0, 'manual');

-- ============================================================
-- INTERNAL CHAT MESSAGES for video editor context
-- ============================================================
INSERT INTO internal_chat_messages (client_id, sender_id, sender_name, message)
VALUES
  (1, 1, 'Jomy George', 'Hey, the raw footage for the latte art tutorial is uploaded to the Drive folder. Please start editing today.'),
  (1, 2, 'Video Editor', 'Got it! I''ll start with the colour grading first. Should I use the warm tone preset or go cooler?'),
  (1, 1, 'Jomy George', 'Warm tones — matches their brand palette. Also add the Artisan Coffee logo watermark.'),
  (1, 2, 'Video Editor', 'Perfect, will do. ETA for first cut is tomorrow evening.'),
  (2, 1, 'Jomy George', 'Jazz night footage is amazing. The saxophone solo at 2:14 is the hero clip for the reel.'),
  (2, 2, 'Video Editor', 'Agreed! I''ll build the edit around that moment. Do we have clearance for the background music?'),
  (2, 1, 'Jomy George', 'Yes, we have a license for the track. Check the shared folder for the audio files.'),
  (3, 1, 'Jomy George', 'The co-working space tour needs to show all 3 floors. Raw footage covers everything.'),
  (3, 2, 'Video Editor', 'I''ll map out the edit structure — intro, floor-by-floor walkthrough, then amenities highlight. Sound good?'),
  (3, 1, 'Jomy George', 'That structure works. Keep it under 3 minutes for YouTube attention spans.');
