-- Telegram kanalini avtomatik sinxronlash: egasi tasdiqlagan kanalning yangi va tahrirlangan
-- postlari bilim bazasiga qo'shiladi (manba uri: tg://channel/<chat_id>/<message_id>).
ALTER TABLE clones ADD COLUMN telegram_sync_chat_id bigint;
ALTER TABLE clones ADD COLUMN telegram_sync_title text;
CREATE INDEX sources_uri ON sources (clone_id, uri);
