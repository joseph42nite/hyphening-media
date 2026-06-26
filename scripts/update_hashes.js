import Database from 'better-sqlite3';

const db = new Database('./data/ops_dashboard.db');

const updates = [
  { email: 'joseph@hyphening.com', hash: '$2a$12$LlomTg8S/5359HF.5TA0MuRjixGlL.WzdIafJf5ajClBa/k/KRQ8G' },
  { email: 'deepanjan@hyphening.com', hash: '$2a$12$okP7BL7bh32PZymbkxtfb.kjk2JAGZ/0LzmRI02jsebWgI/XAS7da' },
  { email: 'editor@hyphening.com', hash: '$2a$10$sQG2Yd6AFHaMRF9SIgX0jOUl/Kc6.v78OZh62kLuuOj.Ss8x39E56' },
  { email: 'social@hyphening.com', hash: '$2a$10$nFU0odOUCj.47pNMd8cVgev5GZooWlEIAtt/6o4.7Vnnv30Iu.m7u' }
];

const stmt = db.prepare("UPDATE users SET password_hash = ? WHERE email = ?");

for (const u of updates) {
  const result = stmt.run(u.hash, u.email);
  console.log(`Updated ${u.email}:`, result.changes);
}
