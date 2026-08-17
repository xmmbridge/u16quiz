-- Bridge Bidding Quiz — schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

-- ---------- Users (simple named accounts, no real auth) ----------
create table users (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  role text not null check (role in ('teacher','student')),
  created_at timestamptz default now()
);

-- ---------- Question templates ----------
-- One row per (auction template, testable bid position) — the atomic "question type".
create table question_templates (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  template_name text not null,
  bids jsonb not null,              -- full bid token sequence from the source file, e.g. ["1N","2C","2D","2N"]
  tested_position int not null,     -- 1-based index into bids[] that this slot tests
  tested_seat text not null check (tested_seat in ('N','E','S','W')),
  is_constructive boolean not null,
  min_hcp int not null,
  max_hcp int not null,
  shapes jsonb not null,            -- array of 4-digit S-H-D-C shape strings, e.g. ["4432","4423"]
  created_at timestamptz default now(),
  unique (source_file, template_name, bids, tested_position)
);

-- ---------- Quizzes ----------
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  quiz_number int unique not null,
  quiz_date date not null
);

-- ---------- Quiz questions (20 per quiz, hand dealt once at generation time) ----------
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  question_template_id uuid not null references question_templates(id),
  position_in_quiz int not null,
  dealt_hand jsonb not null,        -- {"S":["A","K","4"],"H":[...],"D":[...],"C":[...]}
  vulnerability text not null check (vulnerability in ('None','NS','EW','Both')), -- random per board at generation time, same for every student
  unique (quiz_id, position_in_quiz)
);

-- ---------- Quiz attempts (one per user per quiz; tracks pause/resume) ----------
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  user_id uuid not null references users(id),
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  current_position int not null default 1,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  unique (quiz_id, user_id)
);

-- ---------- Answers ----------
create table answers (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references quiz_attempts(id) on delete cascade,
  quiz_question_id uuid not null references quiz_questions(id),
  bid_given text not null,
  answered_at timestamptz default now(),
  unique (quiz_attempt_id, quiz_question_id)
);

-- ---------- Accepted answers (the answer key; can accumulate multiple accepted bids) ----------
create table accepted_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_question_id uuid not null references quiz_questions(id) on delete cascade,
  bid text not null,
  source text not null check (source in ('teacher','challenge')),
  challenge_id uuid,
  created_at timestamptz default now(),
  unique (quiz_question_id, bid)
);

-- ---------- Challenges ----------
create table challenges (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references answers(id) on delete cascade,
  quiz_question_id uuid not null references quiz_questions(id),
  student_id uuid not null references users(id),
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  teacher_reply text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- ---------- Board Q&A (not a grading challenge — just asking about a board) ----------
-- One thread per (question, student); the back-and-forth lives in board_qa_messages.
create table board_qa_threads (
  id uuid primary key default gen_random_uuid(),
  quiz_question_id uuid not null references quiz_questions(id) on delete cascade,
  student_id uuid not null references users(id),
  created_at timestamptz default now(),
  unique (quiz_question_id, student_id)
);

create table board_qa_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references board_qa_threads(id) on delete cascade,
  sender_id uuid not null references users(id),
  sender_role text not null check (sender_role in ('student','teacher')),
  body text not null,
  created_at timestamptz default now()
);

-- ---------- Row Level Security ----------
-- This app has no real authentication (7 known users, name-only login), so we disable RLS
-- and rely on the anon key having full access. This is fine for a small trusted class, but
-- means anyone with the anon key (visible in the deployed site's JS) could read/write data.
-- Do not reuse this Supabase project for anything sensitive.
alter table users disable row level security;
alter table question_templates disable row level security;
alter table quizzes disable row level security;
alter table quiz_questions disable row level security;
alter table quiz_attempts disable row level security;
alter table answers disable row level security;
alter table accepted_answers disable row level security;
alter table challenges disable row level security;
alter table board_qa_threads disable row level security;
alter table board_qa_messages disable row level security;
