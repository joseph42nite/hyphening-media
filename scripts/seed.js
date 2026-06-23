/**
 * Seed Script — Generate proper bcrypt hashes and seed the database.
 * Usage: node scripts/seed.js
 */

import bcrypt from 'bcryptjs';

const users = [
  { email: 'admin@hyphening.com', password: 'Admin123!', name: 'Jomy George', role: 'admin' },
  { email: 'editor@hyphening.com', password: 'VideoEditor123!', name: 'Video Editor', role: 'ops_video_editor' },
  { email: 'social@hyphening.com', password: 'SocialManager123!', name: 'Social Media Manager', role: 'ops_social_media_manager' },
];

async function generateHashes() {
  console.log('-- Generating bcrypt hashes for seed users --\n');
  
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 12);
    console.log(`-- ${user.role}: ${user.email} / ${user.password}`);
    console.log(`-- Hash: ${hash}\n`);
  }
  
  console.log('\nTo seed manually, run the server once — it will execute 002_seed.sql.');
  console.log('For production, update the hashes in 002_seed.sql with the above values.');
}

generateHashes();
