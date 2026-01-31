const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'intermediator.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    participant_count INTEGER NOT NULL DEFAULT 2,
    visibility_mode TEXT NOT NULL CHECK(visibility_mode IN ('open', 'blind')),
    current_round INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting_p2_join' CHECK(status IN ('waiting', 'waiting_p2_join', 'waiting_p2_acceptance', 'p1_answered', 'p2_answering', 'waiting_p1_context', 'waiting_p2_context', 'fact_verification', 'generating_judgment', 'active', 'completed', 'rejected')),
    initial_description TEXT,
    judgment TEXT,
    language TEXT DEFAULT 'en' CHECK(language IN ('en', 'pt')),
    model TEXT,
    title TEXT,
    workflow TEXT DEFAULT 'simple' CHECK(workflow IN ('simple', 'advanced', 'dynamic')),
    p2_acceptance_status TEXT DEFAULT 'pending' CHECK(p2_acceptance_status IN ('pending', 'accepted', 'rejected')),
    ai_summary_p1 TEXT,
    ai_briefing_p2 TEXT,
    p1_context TEXT,
    p2_context TEXT,
    dispute_points TEXT,
    fact_list TEXT,
    p1_fact_verifications TEXT,
    p2_fact_verifications TEXT,
    participant_context TEXT,
    lmstudio_url TEXT,
    lmstudio_model TEXT
  );

  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    participant_number INTEGER NOT NULL,
    joined_at INTEGER,
    is_initiator BOOLEAN DEFAULT 0,
    email TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    participant_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    asked_at INTEGER NOT NULL,
    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    participant_id TEXT NOT NULL,
    response_text TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL,
    disputing_participant_id TEXT NOT NULL,
    dispute_comment TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    addressed_in_round INTEGER,
    FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
    FOREIGN KEY (disputing_participant_id) REFERENCES participants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS p1_initial_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    what_happened TEXT NOT NULL,
    what_led_to_it TEXT NOT NULL,
    how_it_made_them_feel TEXT NOT NULL,
    desired_outcome TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS p2_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    response_type TEXT NOT NULL CHECK(response_type IN ('dispute_text', 'answer_set')),
    dispute_text TEXT,
    what_happened TEXT,
    what_led_to_it TEXT,
    how_it_made_them_feel TEXT,
    desired_outcome TEXT,
    submitted_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
  CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);
  CREATE INDEX IF NOT EXISTS idx_questions_round ON questions(round_id);
  CREATE INDEX IF NOT EXISTS idx_responses_question ON responses(question_id);
  CREATE INDEX IF NOT EXISTS idx_disputes_response ON disputes(response_id);
  CREATE INDEX IF NOT EXISTS idx_p1_answers_session ON p1_initial_answers(session_id);
  CREATE INDEX IF NOT EXISTS idx_p2_responses_session ON p2_responses(session_id);

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('p1_initial', 'p2_response', 'p1_context', 'p2_context')),
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('image', 'text', 'csv', 'pdf', 'document')),
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_participant ON attachments(participant_id);
`);

// Migration: Add lmstudio_url and lmstudio_model columns if they don't exist
try {
  const tableInfo = db.pragma('table_info(sessions)');
  const hasLmstudioUrl = tableInfo.some(col => col.name === 'lmstudio_url');
  const hasLmstudioModel = tableInfo.some(col => col.name === 'lmstudio_model');
  
  if (!hasLmstudioUrl) {
    db.exec('ALTER TABLE sessions ADD COLUMN lmstudio_url TEXT');
    console.log('Added lmstudio_url column to sessions table');
  }
  if (!hasLmstudioModel) {
    db.exec('ALTER TABLE sessions ADD COLUMN lmstudio_model TEXT');
    console.log('Added lmstudio_model column to sessions table');
  }
} catch (err) {
  // Columns already exist or other non-critical error
  console.log('Migration check completed');
}

console.log('Database initialized successfully');

module.exports = db;
