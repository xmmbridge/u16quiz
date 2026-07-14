import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser, clearSessionUser } from '../lib/session.js';

export default function StudentQuizList() {
  const user = getSessionUser();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError(null);
    const { data: quizzes, error: qErr } = await supabase
      .from('quizzes')
      .select('*, quiz_questions(id)')
      .order('quiz_number');
    if (qErr) { setError(qErr.message); return; }

    const { data: attempts, error: aErr } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('user_id', user.id);
    if (aErr) { setError(aErr.message); return; }
    const attemptByQuiz = Object.fromEntries(attempts.map((a) => [a.quiz_id, a]));

    // For submitted attempts, figure out which quizzes are fully graded yet.
    const quizIds = quizzes.map((q) => q.id);
    const { data: acceptedRows, error: accErr } = await supabase
      .from('accepted_answers')
      .select('quiz_question_id, quiz_questions!inner(quiz_id)')
      .in('quiz_questions.quiz_id', quizIds.length ? quizIds : ['00000000-0000-0000-0000-000000000000']);
    if (accErr) { setError(accErr.message); return; }
    const gradedQuestionIdsByQuiz = {};
    acceptedRows.forEach((r) => {
      const qid = r.quiz_questions.quiz_id;
      gradedQuestionIdsByQuiz[qid] = gradedQuestionIdsByQuiz[qid] || new Set();
      gradedQuestionIdsByQuiz[qid].add(r.quiz_question_id);
    });

    setRows(
      quizzes.map((q) => {
        const attempt = attemptByQuiz[q.id];
        const totalQ = q.quiz_questions.length;
        const gradedQ = gradedQuestionIdsByQuiz[q.id]?.size || 0;
        let status = 'not_started';
        if (attempt?.status === 'in_progress') status = 'in_progress';
        else if (attempt?.status === 'submitted') status = gradedQ >= totalQ ? 'graded' : 'pending_grade';
        return { quiz: q, attempt, status, totalQ, gradedQ };
      })
    );
  }

  function logout() {
    clearSessionUser();
    navigate('/');
  }

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">&#9824; Bridge Bidding Quiz &#9829;</div>
        <div className="actions">
          <span className="whoami">{user.name}</span>
          <Link className="btn secondary" to="/student/challenges">My challenges</Link>
          <Link className="btn secondary" to="/student/qa">My Q&amp;A</Link>
          <button className="secondary" onClick={logout}>Switch user</button>
        </div>
      </div>

      <div className="panel">
        <h2>Quizzes</h2>
        {error && <p className="warn-banner">{error}</p>}
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows && (
          <table className="quiz-table">
            <thead>
              <tr><th>#</th><th>Date</th><th>Status</th><th>Answer key</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(({ quiz, status, totalQ, gradedQ }) => (
                <tr key={quiz.id}>
                  <td>{quiz.quiz_number}</td>
                  <td>{quiz.quiz_date}</td>
                  <td>
                    {status === 'not_started' && <span className="status-pill">Not started</span>}
                    {status === 'in_progress' && <span className="status-pill progress">In progress</span>}
                    {status === 'pending_grade' && <span className="status-pill">Submitted &middot; pending grade</span>}
                    {status === 'graded' && <span className="status-pill submitted">Graded</span>}
                  </td>
                  <td>
                    {gradedQ >= totalQ && totalQ > 0 && <span className="status-pill submitted">Set</span>}
                    {gradedQ > 0 && gradedQ < totalQ && <span className="status-pill progress">Partially set ({gradedQ}/{totalQ})</span>}
                    {gradedQ === 0 && <span className="status-pill">Not set yet</span>}
                  </td>
                  <td>
                    {(status === 'not_started' || status === 'in_progress') && (
                      <Link className="btn" to={`/student/quiz/${quiz.id}`}>
                        {status === 'in_progress' ? 'Resume' : 'Start'}
                      </Link>
                    )}
                    {(status === 'pending_grade' || status === 'graded') && (
                      <Link className="btn secondary" to={`/student/results/${quiz.id}`}>View results</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
