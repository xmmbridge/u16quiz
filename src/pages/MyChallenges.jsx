import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser } from '../lib/session.js';
import { formatBid } from '../lib/bidding.js';

export default function MyChallenges() {
  const user = getSessionUser();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from('challenges')
      .select('*, answers(bid_given), quiz_questions(quizzes(quiz_number, quiz_date))')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">My challenges</div>
        <Link className="btn secondary" to="/student">Back to quizzes</Link>
      </div>
      <div className="panel">
        {error && <p className="warn-banner">{error}</p>}
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows && rows.length === 0 && <p className="muted">No challenges filed yet.</p>}
        {rows && rows.length > 0 && (
          <table className="quiz-table">
            <thead><tr><th>Quiz</th><th>Your bid</th><th>Note</th><th>Status</th><th>Teacher reply</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>Quiz {c.quiz_questions.quizzes.quiz_number} ({c.quiz_questions.quizzes.quiz_date})</td>
                  <td>{formatBid(c.answers.bid_given).text}</td>
                  <td>{c.note || <span className="muted">&mdash;</span>}</td>
                  <td><span className="status-pill">{c.status}</span></td>
                  <td>{c.teacher_reply || <span className="muted">&mdash;</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
