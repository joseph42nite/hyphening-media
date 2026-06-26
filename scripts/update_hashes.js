import Database from 'better-sqlite3';

const db = new Database('./data/ops_dashboard.db');

const updates = [
  { email: 'joseph@hyphening.com', hash: '$2a$12$LlomTg8S/5359HF.5TA0MuRjixGlL.WzdIafJf5ajClBa/k/KRQ8G' },
  { email: 'deepanjan@hyphening.com', hash: '$2a$12$okP7BL7bh32PZymbkxtfb.kjk2JAGZ/0LzmRI02jsebWgI/XAS7da' },
  { email: 'editor@hyphening.com', hash: '$2a$12$Rr8lgeutS.83rqC0R3YhjeAOp52Es/8PSPtHp0IJ7pNXdRI5sx1Ki' },
  { email: 'social@hyphening.com', hash: '$2a$12$soVThyCnic35pQGPUgBLX.Epcy8pMrBVoyByJlSyZfPhxBebkX/zS' }
];

const stmt = db.prepare("UPDATE users SET password_hash = ? WHERE email = ?");

for (const u of updates) {
  const result = stmt.run(u.hash, u.email);
  console.log(`Updated ${u.email}:`, result.changes);
}
