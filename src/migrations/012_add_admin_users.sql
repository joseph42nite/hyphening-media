-- Migration: 012_add_admin_users.sql
-- Add logins for Joseph and Deepanjan with admin role.
-- Passwords are bcrypt hashes:
-- Joseph: JosephPassword123! => $2a$12$LlomTg8S/5359HF.5TA0MuRjixGlL.WzdIafJf5ajClBa/k/KRQ8G
-- Deepanjan: DeepanjanPassword123! => $2a$12$okP7BL7bh32PZymbkxtfb.kjk2JAGZ/0LzmRI02jsebWgI/XAS7da

INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'joseph@hyphening.com',
  '$2a$12$LlomTg8S/5359HF.5TA0MuRjixGlL.WzdIafJf5ajClBa/k/KRQ8G',
  'Joseph',
  'admin'
);

INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES (
  'deepanjan@hyphening.com',
  '$2a$12$okP7BL7bh32PZymbkxtfb.kjk2JAGZ/0LzmRI02jsebWgI/XAS7da',
  'Deepanjan',
  'admin'
);
