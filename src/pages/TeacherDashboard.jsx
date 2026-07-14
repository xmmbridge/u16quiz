import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser, clearSessionUser } from '../lib/session.js';

export default function TeacherDashboard() {
  const user = getSessionUser();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pendingChallenges, setPendingChallenges] = useState(0);
  const [pendingQA, setPendingQA] = useState(0);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setError(null);
    const [{ data: quizzes, error: qErr }, { data: students, error: sErr }] = await Promise.all([
      supabase.from('quizzes').select('*').order('quiz_number'),
      supabase.from('users').select('*').eq('role', 'student').order('name'),
    ]);
    if (qErr) { setError(qErr.message); return; }
    if (sErr) { setError(sErr.message); return; }

    const quizIds = quizzes.map((q) => q.id);
    const [{ data: questions, error: qqErr }, { data: attempts, error: aErr }, { data: answers, error: ansErr }, { data: accepted, error: accErr }, { count: pendingCount }, { data: qaThreads, error: qaErr }] = await Promise.all([
      supabase.from('quiz_questions').select('id, quiz_id').in('quiz_id', quizIds.length ? quizIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('quiz_attempts').select('*'),
      supabase.from('answers').select('*'),
      supabase.from('accepted_answers').select('quiz_question_id, bid'),
      supabase.from('challenges').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('board_qa_threads').select('id, board_qa_messages(sender_role, created_at)'),
    ]);
    if (qqErr) { setError(qqErr.message); return; }
    if (aErr) { setError(aErr.message); return; }
    if (ansErr) { setError(ansErr.message); return; }
    if (accErr) { setError(accErr.message); return; }
    if (qaErr) { setError(qaErr.message); return; }
    setPendingChallenges(pendingCount || 0);
    setPendingQA(
      qaThreads.filter((t) => {
        const msgs = [...t.board_qa_messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const last = msgs[msgs.length - 1];
        return last && last.sender_role === 'student';
      }).length
    );

    const questionsByQuiz = {};
    questions.forEach((q) => {
      questionsByQuiz[q.quiz_id] = questionsByQuiz[q.quiz_id] || [];
      questionsByQuiz[q.quiz_id].push(q.id);
    });

    const acceptedByQuestion = {};
    accepted.forEach((r) => {
      acceptedByQuestion[r.quiz_question_id] = acceptedByQuestion[r.quiz_question_id] || new Set();
      acceptedByQuestion[r.quiz_question_id].add(r.bid);
    });

    const answersByAttempt = {};
    answers.forEach((a) => {
      answersByAttempt[a.quiz_attempt_id] = answersByAttempt[a.quiz_attempt_id] || [];
      answersByAttempt[a.quiz_attempt_id].push(a);
    });

    const attemptByQuizUser = {};
    attempts.forEach((a) => { attemptByQuizUser[`${a.quiz_id}:${a.user_id}`] = a; });

    const teacherAttemptStatus = {};
    quizzes.forEach((q) => {
      const a = attemptByQuizUser[`${q.id}:${user.id}`];
      teacherAttemptStatus[q.id] = a?.status || 'not_started';
    });

    // Raw score for one student on one quiz — separated from cellFor's display
    // label so the same numbers can feed both the grid and the leaderboard.
    const statsFor = (quizId, studentId) => {
      const attempt = attemptByQuizUser[`${quizId}:${studentId}`];
      const totalQ = (questionsByQuiz[quizId] || []).length;
      if (!attempt || attempt.status !== 'submitted') return { submitted: false, correct: 0, graded: 0, totalQ };
      const studentAnswers = answersByAttempt[attempt.id] || [];
      let correct = 0, graded = 0;
      studentAnswers.forEach((ans) => {
        const acc = acceptedByQuestion[ans.quiz_question_id];
        if (acc && acc.size > 0) {
          graded += 1;
          if (acc.has(ans.bid_given)) correct += 1;
        }
      });
      return { submitted: true, correct, graded, totalQ };
    };

    const cellFor = (quizId, studentId) => {
      const attempt = attemptByQuizUser[`${quizId}:${studentId}`];
      if (!attempt) return { label: '—', kind: 'none' };
      if (attempt.status === 'in_progress') return { label: 'In progress', kind: 'progress' };
      const { correct, graded, totalQ } = statsFor(quizId, studentId);
      return { label: `${correct}/${graded}${graded < totalQ ? ` (${totalQ - graded} pending)` : ''}`, kind: 'submitted' };
    };

    // Token: awarded to whoever scored highest (ties all win) on a quiz, once
    // every question on that quiz has been graded. Feeds both the per-quiz
    // highlight and each student's cumulative token count.
    const winnersByQuiz = {};
    const tokensByStudent = {};
    const percentSumByStudent = {};
    const percentCountByStudent = {};
    students.forEach((s) => { tokensByStudent[s.id] = 0; percentSumByStudent[s.id] = 0; percentCountByStudent[s.id] = 0; });

    quizzes.forEach((q) => {
      const qIds = questionsByQuiz[q.id] || [];
      const totalQ = qIds.length;
      const gradedQ = qIds.filter((id) => (acceptedByQuestion[id]?.size || 0) > 0).length;
      const fullyGraded = totalQ > 0 && gradedQ === totalQ;

      let maxCorrect = -1;
      const submittedScores = [];
      students.forEach((s) => {
        const stat = statsFor(q.id, s.id);
        if (!stat.submitted) return;
        if (stat.graded > 0) {
          percentSumByStudent[s.id] += (stat.correct / stat.graded) * 100;
          percentCountByStudent[s.id] += 1;
        }
        if (fullyGraded) {
          submittedScores.push({ studentId: s.id, correct: stat.correct });
          if (stat.correct > maxCorrect) maxCorrect = stat.correct;
        }
      });
      if (fullyGraded && submittedScores.length > 0) {
        const winners = submittedScores.filter((r) => r.correct === maxCorrect).map((r) => r.studentId);
        winnersByQuiz[q.id] = new Set(winners);
        winners.forEach((id) => { tokensByStudent[id] += 1; });
      }
    });

    const avgByStudent = {};
    students.forEach((s) => {
      avgByStudent[s.id] = percentCountByStudent[s.id] > 0 ? percentSumByStudent[s.id] / percentCountByStudent[s.id] : null;
    });

    const leaderboard = [...students].sort((a, b) => {
      if (tokensByStudent[b.id] !== tokensByStudent[a.id]) return tokensByStudent[b.id] - tokensByStudent[a.id];
      return (avgByStudent[b.id] ?? -1) - (avgByStudent[a.id] ?? -1);
    });

    setData({ quizzes, students, teacherAttemptStatus, cellFor, winnersByQuiz, tokensByStudent, avgByStudent, leaderboard });
  }

  function logout() {
    clearSessionUser();
    navigate('/');
  }

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">&#9824; Teacher Dashboard &#9829;</div>
        <div className="actions">
          <span className="whoami">{user.name}</span>
          <Link className="btn secondary" to="/teacher/challenges">
            Challenges{pendingChallenges > 0 ? ` (${pendingChallenges} pending)` : ''}
          </Link>
          <Link className="btn secondary" to="/teacher/qa">
            Q&amp;A{pendingQA > 0 ? ` (${pendingQA} pending)` : ''}
          </Link>
          <button className="secondary" onClick={logout}>Switch user</button>
        </div>
      </div>

      {data && (
        <div className="panel">
          <h2>Class overview</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Average score across graded quizzes, and tokens earned for the top score of the day (fully graded quizzes only).
          </p>
          <table className="quiz-table">
            <thead>
              <tr><th>Student</th><th>Average score</th><th>Tokens</th></tr>
            </thead>
            <tbody>
              {data.leaderboard.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{data.avgByStudent[s.id] != null ? `${data.avgByStudent[s.id].toFixed(1)}%` : <span className="muted">&mdash;</span>}</td>
                  <td>{data.tokensByStudent[s.id] > 0 ? `★ ${data.tokensByStudent[s.id]}` : <span className="muted">&mdash;</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        {error && <p className="warn-banner">{error}</p>}
        {!data && !error && <p className="muted">Loading...</p>}
        {data && (
          <div style={{ overflowX: 'auto' }}>
            <table className="quiz-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Answer key</th>
                  {data.students.map((s) => <th key={s.id}>{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.quizzes.map((q) => (
                  <tr key={q.id}>
                    <td>#{q.quiz_number} <span className="muted">({q.quiz_date})</span></td>
                    <td>
                      <Link className="btn secondary" to={`/teacher/quiz/${q.id}`}>
                        {data.teacherAttemptStatus[q.id] === 'submitted'
                          ? 'Review'
                          : data.teacherAttemptStatus[q.id] === 'in_progress'
                            ? 'Resume'
                            : 'Answer'}
                      </Link>
                    </td>
                    {data.students.map((s) => {
                      const cell = data.cellFor(q.id, s.id);
                      const won = data.winnersByQuiz[q.id]?.has(s.id);
                      return (
                        <td key={s.id} className={won ? 'token-win' : ''}>
                          {cell.kind === 'submitted' ? (
                            <Link to={`/teacher/quiz/${q.id}/missed/${s.id}`}>{won && '★ '}{cell.label}</Link>
                          ) : (
                            cell.label
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
