import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { formatBid } from '../lib/bidding.js';
import AuctionTable from '../components/AuctionTable.jsx';
import Hand from '../components/Hand.jsx';

export default function MissedAnswers() {
  const { quizId, studentId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, studentId]);

  async function load() {
    setError(null);
    const { data: quizRow, error: quizErr } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
    if (quizErr) { setError(quizErr.message); return; }
    setQuiz(quizRow);

    const { data: questions, error: qErr } = await supabase
      .from('quiz_questions')
      .select('*, question_templates(*)')
      .eq('quiz_id', quizId)
      .order('position_in_quiz');
    if (qErr) { setError(qErr.message); return; }

    let studentsQuery = supabase.from('users').select('id, name').eq('role', 'student');
    if (studentId) studentsQuery = studentsQuery.eq('id', studentId);
    const { data: students, error: sErr } = await studentsQuery;
    if (sErr) { setError(sErr.message); return; }
    const studentById = Object.fromEntries(students.map((s) => [s.id, s.name]));
    setStudentName(studentId ? studentById[studentId] || null : null);

    const { data: attempts, error: aErr } = await supabase
      .from('quiz_attempts')
      .select('id, user_id')
      .eq('quiz_id', quizId)
      .eq('status', 'submitted')
      .in('user_id', students.map((s) => s.id).length ? students.map((s) => s.id) : ['00000000-0000-0000-0000-000000000000']);
    if (aErr) { setError(aErr.message); return; }
    const studentNameByAttempt = Object.fromEntries(attempts.map((a) => [a.id, studentById[a.user_id]]));

    const questionIds = questions.map((q) => q.id);
    const [{ data: answers, error: ansErr }, { data: accepted, error: accErr }] = await Promise.all([
      supabase.from('answers').select('*').in('quiz_attempt_id', attempts.map((a) => a.id).length ? attempts.map((a) => a.id) : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('accepted_answers').select('*').in('quiz_question_id', questionIds.length ? questionIds : ['00000000-0000-0000-0000-000000000000']),
    ]);
    if (ansErr) { setError(ansErr.message); return; }
    if (accErr) { setError(accErr.message); return; }

    const acceptedByQuestion = {};
    accepted.forEach((r) => {
      acceptedByQuestion[r.quiz_question_id] = acceptedByQuestion[r.quiz_question_id] || new Set();
      acceptedByQuestion[r.quiz_question_id].add(r.bid);
    });

    const answersByQuestion = {};
    answers.forEach((a) => {
      if (!studentNameByAttempt[a.quiz_attempt_id]) return; // ignore stray/teacher attempts
      answersByQuestion[a.quiz_question_id] = answersByQuestion[a.quiz_question_id] || [];
      answersByQuestion[a.quiz_question_id].push(a);
    });

    const built = questions.map((q) => {
      const acceptedSet = acceptedByQuestion[q.id] || new Set();
      const isGraded = acceptedSet.size > 0;
      const qAnswers = answersByQuestion[q.id] || [];
      const misses = isGraded
        ? qAnswers
            .filter((a) => !acceptedSet.has(a.bid_given))
            .map((a) => ({ studentName: studentNameByAttempt[a.quiz_attempt_id], bid: a.bid_given }))
            .sort((a, b) => a.studentName.localeCompare(b.studentName))
        : [];
      return {
        question: q,
        acceptedBids: Array.from(acceptedSet),
        isGraded,
        totalAnswered: qAnswers.length,
        misses,
      };
    });

    setRows(built);
  }

  if (error) {
    return (
      <div className="wrap">
        <div className="panel"><p className="warn-banner">{error}</p><Link className="btn secondary" to="/teacher">Back to dashboard</Link></div>
      </div>
    );
  }
  if (!quiz || !rows) {
    return <div className="wrap"><div className="panel"><p className="muted">Loading...</p></div></div>;
  }

  const missedRows = rows.filter((r) => r.misses.length > 0);
  const ungradedCount = rows.filter((r) => !r.isGraded).length;
  const totalMisses = missedRows.reduce((sum, r) => sum + r.misses.length, 0);
  const noAttempt = studentId && studentName && rows.every((r) => r.totalAnswered === 0);

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">
          Quiz {quiz.quiz_number} &middot; {quiz.quiz_date} &mdash; {studentName ? `${studentName}'s missed answers` : 'missed answers'}
        </div>
        <Link className="btn secondary" to="/teacher">Back to dashboard</Link>
      </div>

      <div className="panel">
        {studentId && !studentName ? (
          <p className="warn-banner">Student not found.</p>
        ) : noAttempt ? (
          <p className="muted">{studentName} hasn't submitted this quiz yet.</p>
        ) : missedRows.length === 0 ? (
          <p className="muted">
            No wrong answers {ungradedCount > 0 ? 'so far' : 'on this quiz'}.
            {ungradedCount > 0 && ` (${ungradedCount} question(s) not yet graded.)`}
          </p>
        ) : (
          <p className="muted">
            {totalMisses} wrong answer(s) across {missedRows.length} question(s).
            {ungradedCount > 0 && ` ${ungradedCount} question(s) not yet graded.`}
          </p>
        )}
      </div>

      {missedRows.map((row) => {
        const tpl = row.question.question_templates;
        const auctionSoFar = tpl.bids.slice(0, tpl.tested_position - 1);
        return (
          <div className="panel" key={row.question.id}>
            <p className="muted">
              Question {row.question.position_in_quiz} &mdash; tested seat {tpl.tested_seat}
            </p>
            <AuctionTable
              auctionSoFar={auctionSoFar}
              isConstructive={tpl.is_constructive}
              testedSeat={tpl.tested_seat}
              vulnerability={row.question.vulnerability}
            />
            <Hand hand={row.question.dealt_hand} />
            <p style={{ marginTop: 10 }}>
              Accepted: <b>{row.acceptedBids.map((b) => formatBid(b).text).join(', ')}</b>
            </p>
            <ul style={{ marginTop: 6 }}>
              {row.misses.map((m, i) => (
                <li key={i}>
                  {!studentId && `${m.studentName}: `}
                  <span className="verdict wrong">{formatBid(m.bid).text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
