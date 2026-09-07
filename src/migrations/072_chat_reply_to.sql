-- Lets an internal chat message point at the earlier message it answers.
-- Nullable, so every existing message stays a plain top-level message.
-- The reply keeps its own text if the quoted message is ever removed, so the
-- reference is set to NULL rather than cascading the delete.
ALTER TABLE internal_chat_messages ADD COLUMN reply_to_id INTEGER REFERENCES internal_chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_chats_reply_to ON internal_chat_messages(reply_to_id);
