/**
 * Seed Script — Generate proper bcrypt hashes and seed the database.
 * Usage: node scripts/seed.js
 */

import bcrypt from 'bcryptjs';

const users = [
  { email: 'joseph@hyphening.com', password: process.env.SEED_JOSEPH_PASSWORD || 'SetupTemporaryPassword123!', name: 'Joseph', role: 'admin' },
  { email: 'deepanjan@hyphening.com', password: process.env.SEED_DEEPANJAN_PASSWORD || 'SetupTemporaryPassword123!', name: 'Deepanjan', role: 'admin' },
  { email: 'editor@hyphening.com', password: process.env.SEED_EDITOR_PASSWORD || 'SetupTemporaryPassword123!', name: 'Ashu', role: 'ops_video_editor' },
  { email: 'social@hyphening.com', password: process.env.SEED_SMM_PASSWORD || 'SetupTemporaryPassword123!', name: 'Omkar', role: 'ops_social_media_manager' },
];

async function generateHashes() {
  console.log('-- Generating bcrypt hashes for seed users --\n');
  
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 12);
    console.log(`-- ${user.role}: ${user.email} / ${user.password}`);
    console.log(`-- Hash: ${hash}\n`);
  }
  
  console.log('\nTo seed manually, run the server once — it will execute 002_seed.sql.');
  console.log('For production, set custom passwords in your environment variables before seeding.');
}

generateHashes();
