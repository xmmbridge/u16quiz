import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser } from '../lib/session.js';
import { formatBid } from '../lib/bidding.js';
import Hand from '../components/Hand.jsx';
import AuctionTable from '../components/AuctionTable.jsx';
import QAThread from '../components/QAThread.jsx';

export default function Results() {
  const { quizId } = useParams();
  const user = getSessionUser();
  const [quiz, setQuiz] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [openChallengeFor, setOpenChallengeFor] = useState(null);
  const [challengeNote, setChallengeNote] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  async function load() {
    setError(null);
    const { data: quizRow, error: quizErr } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
    if (quizErr) { setError(quizErr.message); return; }
    setQuiz(quizRow);

    const { data: attempt, error: attErr } = await supabase
      .from('quiz_attempts').select('*').eq('quiz_id', quizId).eq('user_id', user.id).maybeSingle();
    if (attErr) { setError(attErr.message); return; }
    if (!attempt || attempt.status !== 'submitted') {
      setError('You have not submitted this quiz yet.');
      return;
    }

    const { data: questions, error: qErr } = await supabase
      .from('quiz_questions').select('*, question_templates(*)').eq('quiz_id', quizId).order('position_in_quiz');
    if (qErr) { setError(qErr.message); return; }

    const { data: answers, error: aErr } = await supabase
      .from('answers').select('*').eq('quiz_attempt_id', attempt.id);
    if (aErr) { setError(aErr.message); return; }
    const answerByQuestion = Object.fromEntries(answers.map((a) => [a.quiz_question_id, a]));

    const questionIds = questions.map((q) => q.id);
    const { data: accepted, error: accErr } = await supabase
      .from('accepted_answers').select('*').in('quiz_question_id', questionIds);
    if (accErr) { setError(accErr.message); return; }
    const acceptedByQuestion = {};
    accepted.forEach((row) => {
      acceptedByQuestion[row.quiz_question_id] = acceptedByQuestion[row.quiz_question_id] || new Set();
      acceptedByQuestion[row.quiz_question_id].add(row.bid);
    });

    const { data: challenges, error: chErr } = await supabase
      .from('challenges').select('*').eq('student_id', user.id).in('quiz_question_id', questionIds);
    if (chErr) { setError(chErr.message); return; }
    const challengeByQuestion = Object.fromEntries(challenges.map((c) => [c.quiz_question_id, c]));

    setRows(
      questions.map((q) => {
        const answer = answerByQuestion[q.id];
        const acceptedSet = acceptedByQuestion[q.id] || new Set();
        const isGraded = acceptedSet.size > 0;
        const isCorrect = isGraded && acceptedSet.has(answer?.bid_given);
        return {
          question: q,
          answer,
          acceptedBids: Array.from(acceptedSet),
          isGraded,
          isCorrect,
          challenge: challengeByQuestion[q.id],
        };
      })
    );
  }

  async function submitChallenge(row) {
    const { error: insErr } = await supabase.from('challenges').insert({
      answer_id: row.answer.id,
      quiz_question_id: row.question.id,
      student_id: user.id,
      note: challengeNote.trim() || null,
    });
    if (insErr) { setError(insErr.message); return; }
    setOpenChallengeFor(null);
    setChallengeNote('');
    load();
  }

  if (error) {
    return <div className="wrap"><div className="panel"><p className="warn-banner">{error}</p><Link className="btn secondary" to="/student">Back to quizzes</Link></div></div>;
  }
  if (!quiz || !rows) {
    return <div className="wrap"><div className="panel"><p className="muted">Loading...</p></div></div>;
  }

  const gradedRows = rows.filter((r) => r.isGraded);
  const correctCount = gradedRows.filter((r) => r.isCorrect).length;

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">Quiz {quiz.quiz_number} results &middot; {quiz.quiz_date}</div>
        <Link className="btn secondary" to="/student">Back to quizzes</Link>
      </div>

      <div className="panel score-banner">
        <div className="score">{correctCount} / {gradedRows.length}</div>
        <div className="label">Correct (of graded questions)</div>
        {gradedRows.length < rows.length && (
          <p className="muted" style={{ marginTop: 10 }}>
            {rows.length - gradedRows.length} question(s) not yet graded by the teacher &mdash; check back later.
          </p>
        )}
      </div>

      {rows.map((row, i) => {
        const tpl = row.question.question_templates;
        const auctionSoFar = tpl.bids.slice(0, tpl.tested_position - 1);
        return (
          <div className="panel" key={row.question.id}>
            <p className="muted">Question {i + 1} &mdash; you were {tpl.tested_seat}</p>
            <AuctionTable
              auctionSoFar={auctionSoFar}
              isConstructive={tpl.is_constructive}
              testedSeat={tpl.tested_seat}
              vulnerability={row.question.vulnerability}
            />
            <Hand hand={row.question.dealt_hand} />
            <p style={{ marginTop: 10 }}>
              Your bid: <b>{formatBid(row.answer?.bid_given).text}</b>
              {row.isGraded ? (
                <>
                  {' — '}
                  <span className={`verdict ${row.isCorrect ? 'right' : 'wrong'}`}>
                    {row.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                  {!row.isCorrect && (
                    <span className="muted"> (accepted: {row.acceptedBids.map((b) => formatBid(b).text).join(', ')})</span>
                  )}
                </>
              ) : (
                <span className="status-pill" style={{ marginLeft: 8 }}>Pending grade</span>
              )}
            </p>

            {row.isGraded && !row.isCorrect && !row.challenge && openChallengeFor !== row.question.id && (
              <button className="secondary" style={{ marginTop: 8 }} onClick={() => setOpenChallengeFor(row.question.id)}>
                Challenge this answer
              </button>
            )}
            {openChallengeFor === row.question.id && (
              <div style={{ marginTop: 8 }}>
                <textarea
                  rows={2}
                  placeholder="Why do you think your bid should be accepted? (optional)"
                  value={challengeNote}
                  onChange={(e) => setChallengeNote(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={() => submitChallenge(row)}>Submit challenge</button>
                  <button className="secondary" onClick={() => { setOpenChallengeFor(null); setChallengeNote(''); }}>Cancel</button>
                </div>
              </div>
            )}
            {row.challenge && (
              <p className="muted" style={{ marginTop: 8 }}>
                Challenge status: <b>{row.challenge.status}</b>
                {row.challenge.teacher_reply && <> &mdash; teacher: "{row.challenge.teacher_reply}"</>}
              </p>
            )}

            <div style={{ marginTop: 8 }}>
              <QAThread quizQuestionId={row.question.id} studentId={user.id} currentUser={user} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
