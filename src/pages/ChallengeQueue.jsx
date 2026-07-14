import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { formatBid } from '../lib/bidding.js';
import AuctionTable from '../components/AuctionTable.jsx';
import Hand from '../components/Hand.jsx';

export default function ChallengeQueue() {
  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [error, setError] = useState(null);
  const [replies, setReplies] = useState({});
  const [statusFilter, setStatusFilter] = useState('pending');
  const [studentFilter, setStudentFilter] = useState('all');
  const [quizFilter, setQuizFilter] = useState('all');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError(null);
    const [{ data, error }, { data: studentRows, error: sErr }, { data: quizRows, error: qErr }] = await Promise.all([
      supabase
        .from('challenges')
        .select(`
          *,
          answers(bid_given),
          users(name),
          quiz_questions(*, question_templates(*), quizzes(id, quiz_number, quiz_date))
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

  async function resolve(challenge, decision) {
    const reply = replies[challenge.id] || '';
    if (decision === 'accepted') {
      const { error: accErr } = await supabase
        .from('accepted_answers')
        .upsert(
          { quiz_question_id: challenge.quiz_question_id, bid: challenge.answers.bid_given, source: 'challenge', challenge_id: challenge.id },
          { onConflict: 'quiz_question_id,bid', ignoreDuplicates: true }
        );
      if (accErr) { setError(accErr.message); return; }
    }
    const { error: updErr } = await supabase
      .from('challenges')
      .update({ status: decision, teacher_reply: reply || null, resolved_at: new Date().toISOString() })
      .eq('id', challenge.id);
    if (updErr) { setError(updErr.message); return; }
    load();
  }

  const counts = useMemo(() => {
    if (!rows) return { pending: 0, accepted: 0, rejected: 0 };
    return {
      pending: rows.filter((c) => c.status === 'pending').length,
      accepted: rows.filter((c) => c.status === 'accepted').length,
      rejected: rows.filter((c) => c.status === 'rejected').length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (studentFilter !== 'all' && c.student_id !== studentFilter) return false;
      if (quizFilter !== 'all' && c.quiz_questions.quizzes.id !== quizFilter) return false;
      return true;
    });
  }, [rows, statusFilter, studentFilter, quizFilter]);

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">Challenges</div>
        <Link className="btn secondary" to="/teacher">Back to dashboard</Link>
      </div>

      <div className="panel">
        {error && <p className="warn-banner">{error}</p>}
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows && (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              {counts.pending} pending &middot; {counts.accepted} accepted &middot; {counts.rejected} rejected &middot; {rows.length} total
            </p>
            <div className="filter-bar">
              <label>
                Status
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
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
            {filtered.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No challenges match this filter.</p>}
          </>
        )}
      </div>

      {filtered.map((c) => {
        const tpl = c.quiz_questions.question_templates;
        const auctionSoFar = tpl.bids.slice(0, tpl.tested_position - 1);
        return (
          <div className="panel" key={c.id}>
            <p className="muted">
              Quiz {c.quiz_questions.quizzes.quiz_number} ({c.quiz_questions.quizzes.quiz_date}) &middot; from {c.users.name}
              {' '}&middot; <span className={`status-pill ${c.status === 'accepted' ? 'submitted' : c.status === 'pending' ? 'progress' : ''}`}>{c.status}</span>
            </p>
            <AuctionTable
              auctionSoFar={auctionSoFar}
              isConstructive={tpl.is_constructive}
              testedSeat={tpl.tested_seat}
              vulnerability={c.quiz_questions.vulnerability}
            />
            <Hand hand={c.quiz_questions.dealt_hand} />
            <p style={{ marginTop: 10 }}>
              Student's bid: <b>{formatBid(c.answers.bid_given).text}</b>
            </p>
            {c.note && <p className="muted">Student note: "{c.note}"</p>}
            {c.status === 'pending' ? (
              <>
                <textarea
                  rows={2}
                  placeholder="Optional reply to student"
                  value={replies[c.id] || ''}
                  onChange={(e) => setReplies({ ...replies, [c.id]: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => resolve(c, 'accepted')}>Accept</button>
                  <button className="danger" onClick={() => resolve(c, 'rejected')}>Reject</button>
                </div>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>
                Resolved {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : ''}
                {c.teacher_reply && <> &mdash; teacher: "{c.teacher_reply}"</>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
