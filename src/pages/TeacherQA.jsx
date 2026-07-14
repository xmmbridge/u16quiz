import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser } from '../lib/session.js';
import QAThread from '../components/QAThread.jsx';
import AuctionTable from '../components/AuctionTable.jsx';
import Hand from '../components/Hand.jsx';

export default function TeacherQA() {
  const user = getSessionUser();
  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('needs_reply');
  const [studentFilter, setStudentFilter] = useState('all');
  const [quizFilter, setQuizFilter] = useState('all');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setError(null);
    const [{ data, error }, { data: studentRows, error: sErr }, { data: quizRows, error: qErr }] = await Promise.all([
      supabase
        .from('board_qa_threads')
        .select(`
          *,
          users(name),
          quiz_questions(*, question_templates(*), quizzes(id, quiz_number, quiz_date)),
          board_qa_messages(id, sender_role, body, created_at)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('users').select('id, name').eq('role', 'student').order('name'),
      supabase.from('quizzes').select('id, quiz_number, quiz_date').order('quiz_number'),
    ]);
    if (error) { setError(error.message); return; }
    if (sErr) { setError(sErr.message); return; }
    if (qErr) { setError(qErr.message); return; }
    setRows(data);
    setStudents(studentRows);
    setQuizzes(quizRows);
  }

  const enriched = useMemo(() => {
    if (!rows) return [];
    return rows.map((t) => {
      const messages = [...t.board_qa_messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const last = messages[messages.length - 1];
      return { ...t, awaitingReply: !!last && last.sender_role === 'student' };
    });
  }, [rows]);

  const counts = useMemo(() => ({
    needsReply: enriched.filter((t) => t.awaitingReply).length,
    total: enriched.length,
  }), [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter((t) => {
      if (statusFilter === 'needs_reply' && !t.awaitingReply) return false;
      if (studentFilter !== 'all' && t.student_id !== studentFilter) return false;
      if (quizFilter !== 'all' && t.quiz_questions.quizzes.id !== quizFilter) return false;
      return true;
    });
  }, [enriched, statusFilter, studentFilter, quizFilter]);

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">Q&amp;A</div>
        <Link className="btn secondary" to="/teacher">Back to dashboard</Link>
      </div>

      <div className="panel">
        {error && <p className="warn-banner">{error}</p>}
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows && (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              {counts.needsReply} awaiting reply &middot; {counts.total} total threads
            </p>
            <div className="filter-bar">
              <label>
                Status
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="needs_reply">Awaiting reply</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label>
                Student
                <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
                  <option value="all">All</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>
                Quiz
                <select value={quizFilter} onChange={(e) => setQuizFilter(e.target.value)}>
                  <option value="all">All</option>
                  {quizzes.map((q) => <option key={q.id} value={q.id}>#{q.quiz_number} ({q.quiz_date})</option>)}
                </select>
              </label>
            </div>
            {filtered.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No threads match this filter.</p>}
          </>
        )}
      </div>

      {filtered.map((t) => {
        const q = t.quiz_questions;
        const tpl = q.question_templates;
        const auctionSoFar = tpl.bids.slice(0, tpl.tested_position - 1);
        return (
          <div className="panel" key={t.id}>
            <p className="muted">
              Quiz {q.quizzes.quiz_number} ({q.quizzes.quiz_date}) &middot; question {q.position_in_quiz} &middot; from {t.users.name}
              {t.awaitingReply && <span className="status-pill" style={{ marginLeft: 8 }}>Awaiting reply</span>}
            </p>
            <AuctionTable
              auctionSoFar={auctionSoFar}
              isConstructive={tpl.is_constructive}
              testedSeat={tpl.tested_seat}
              vulnerability={q.vulnerability}
            />
            <Hand hand={q.dealt_hand} />
            <div style={{ marginTop: 10 }}>
              <QAThread quizQuestionId={t.quiz_question_id} studentId={t.student_id} currentUser={user} startOpen />
            </div>
          </div>
        );
      })}
    </div>
  );
}
