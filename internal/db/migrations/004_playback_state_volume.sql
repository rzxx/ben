ALTER TABLE playback_state
ADD COLUMN volume INTEGER NOT NULL DEFAULT 80 CHECK (volume >= 0 AND volume <= 100);
