import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser } from '../lib/session.js';
import QAThread from '../components/QAThread.jsx';

export default function MyQA() {
  const user = getSessionUser();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setError(null);
    const { data, error } = await supabase
      .from('board_qa_threads')
      .select('*, quiz_questions(position_in_quiz, quizzes(quiz_number, quiz_date)), board_qa_messages(id, sender_role, body, created_at)')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { setError(error.message); return; }
    setRows(data);
  }

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">My Q&amp;A</div>
        <Link className="btn secondary" to="/student">Back to quizzes</Link>
      </div>
      <div className="panel">
        {error && <p className="warn-banner">{error}</p>}
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows && rows.length === 0 && <p className="muted">No questions asked yet — you can ask about any board from its results page.</p>}
      </div>

      {rows && rows.map((t) => {
        const q = t.quiz_questions;
        const messages = [...t.board_qa_messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const last = messages[messages.length - 1];
        const awaitingReply = last && last.sender_role === 'student';
        return (
          <div className="panel" key={t.id}>
            <p className="muted">
              Quiz {q.quizzes.quiz_number} ({q.quizzes.quiz_date}) &middot; question {q.position_in_quiz}
              {awaitingReply && <span className="status-pill" style={{ marginLeft: 8 }}>Awaiting reply</span>}
            </p>
            <QAThread quizQuestionId={t.quiz_question_id} studentId={user.id} currentUser={user} startOpen />
          </div>
        );
      })}
    </div>
  );
}
