import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser } from '../lib/session.js';
import { legalBids } from '../lib/bidding.js';
import Hand from '../components/Hand.jsx';
import AuctionTable from '../components/AuctionTable.jsx';
import BiddingBox from '../components/BiddingBox.jsx';

export default function QuizTaking() {
  const { quizId } = useParams();
  const user = getSessionUser();
  const navigate = useNavigate();
  const homePath = user.role === 'teacher' ? '/teacher' : '/student';

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({}); // quiz_question_id -> bid_given
  const [viewIndex, setViewIndex] = useState(0);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  async function load() {
    setError(null);
    const { data: quizRow, error: quizErr } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
    if (quizErr) { setError(quizErr.message); return; }
    setQuiz(quizRow);

    const { data: qRows, error: qErr } = await supabase
      .from('quiz_questions')
      .select('*, question_templates(*)')
      .eq('quiz_id', quizId)
      .order('position_in_quiz');
    if (qErr) { setError(qErr.message); return; }
    setQuestions(qRows);

    let { data: attemptRow, error: attErr } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('quiz_id', quizId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (attErr) { setError(attErr.message); return; }

    if (!attemptRow) {
      const { data: created, error: insErr } = await supabase
        .from('quiz_attempts')
        .insert({ quiz_id: quizId, user_id: user.id, status: 'in_progress', current_position: 1 })
        .select()
        .single();
      if (insErr) { setError(insErr.message); return; }
      attemptRow = created;
    }

    if (attemptRow.status === 'submitted' && user.role !== 'teacher') {
      navigate(`/student/results/${quizId}`, { replace: true });
      return;
    }
    setAttempt(attemptRow);

    const { data: answerRows, error: ansErr } = await supabase
      .from('answers')
      .select('quiz_question_id, bid_given')
      .eq('quiz_attempt_id', attemptRow.id);
    if (ansErr) { setError(ansErr.message); return; }
    const answerMap = {};
    for (const a of answerRows) answerMap[a.quiz_question_id] = a.bid_given;
    setAnswers(answerMap);

    const firstUnanswered = qRows.findIndex((q) => !(q.id in answerMap));
    setViewIndex(firstUnanswered === -1 ? qRows.length - 1 : firstUnanswered);
  }

  async function submitBid(bid) {
    if (submitting || !questions) return;
    setSubmitting(true);
    setError(null);
    const q = questions[viewIndex];

    const { error: ansErr } = await supabase
      .from('answers')
      .upsert(
        { quiz_attempt_id: attempt.id, quiz_question_id: q.id, bid_given: bid },
        { onConflict: 'quiz_attempt_id,quiz_question_id' }
      );
    if (ansErr) { setError(ansErr.message); setSubmitting(false); return; }

    if (user.role === 'teacher') {
      // Drop any previous teacher-sourced pick for this question that isn't the new
      // bid, so revising an answer doesn't leave a stale bid marked as accepted.
      // Bids accepted via a student challenge are left alone.
      const { error: delErr } = await supabase
        .from('accepted_answers')
        .delete()
        .eq('quiz_question_id', q.id)
        .eq('source', 'teacher')
        .neq('bid', bid);
      if (delErr) { setError(delErr.message); setSubmitting(false); return; }

      // Ignore duplicate-key errors — it's fine if this exact bid was already
      // accepted for this question (e.g. via a challenge).
      const { error: keyErr } = await supabase
        .from('accepted_answers')
        .upsert(
          { quiz_question_id: q.id, bid, source: 'teacher' },
          { onConflict: 'quiz_question_id,bid', ignoreDuplicates: true }
        );
      if (keyErr) { setError(keyErr.message); setSubmitting(false); return; }
    }

    const nextAnswers = { ...answers, [q.id]: bid };
    setAnswers(nextAnswers);

    const nextIndex = viewIndex + 1 < questions.length ? viewIndex + 1 : viewIndex;
    const { error: updErr } = await supabase
      .from('quiz_attempts')
      .update({ current_position: nextIndex + 1 })
      .eq('id', attempt.id);
    if (updErr) { setError(updErr.message); setSubmitting(false); return; }

    if (viewIndex + 1 < questions.length) setViewIndex(viewIndex + 1);
    setSubmitting(false);
  }

  async function finishQuiz() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('quiz_attempts')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', attempt.id);
    if (updErr) { setError(updErr.message); setSubmitting(false); return; }
    navigate(user.role === 'teacher' ? homePath : `/student/results/${quizId}`);
  }

  if (error) {
    return (
      <div className="wrap">
        <div className="panel"><p className="warn-banner">{error}</p></div>
      </div>
    );
  }
  if (!quiz || !questions || !attempt) {
    return <div className="wrap"><div className="panel"><p className="muted">Loading...</p></div></div>;
  }

  const q = questions[viewIndex];
  const tpl = q.question_templates;
  const auctionSoFar = tpl.bids.slice(0, tpl.tested_position - 1);
  const options = legalBids(auctionSoFar, tpl.is_constructive);
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">Quiz {quiz.quiz_number} &middot; {quiz.quiz_date}</div>
        <div className="whoami">
          {user.name} {user.role === 'teacher' && (attempt.status === 'submitted' ? '(reviewing answer key)' : '(setting answer key)')}
        </div>
      </div>

      <div className="progress-dots">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            type="button"
            className={`dot ${qq.id in answers ? 'done' : ''} ${i === viewIndex ? 'current' : ''}`}
            aria-label={`Go to question ${i + 1}`}
            onClick={() => setViewIndex(i)}
          />
        ))}
      </div>

      <div className="quiz-nav">
        <button type="button" className="nav-btn" disabled={viewIndex === 0} onClick={() => setViewIndex(viewIndex - 1)}>
          &larr; Previous
        </button>
        <button
          type="button"
          className="nav-btn"
          disabled={viewIndex === questions.length - 1}
          onClick={() => setViewIndex(viewIndex + 1)}
        >
          Next &rarr;
        </button>
      </div>

      <div className="quiz-top-row">
        <div className="panel quiz-col">
          <Hand hand={q.dealt_hand} />
        </div>

        <div className="panel quiz-col">
          <p className="muted">Question {viewIndex + 1} of {questions.length} &mdash; you are {tpl.tested_seat}</p>
          <AuctionTable
            auctionSoFar={auctionSoFar}
            isConstructive={tpl.is_constructive}
            testedSeat={tpl.tested_seat}
            vulnerability={q.vulnerability}
          />
        </div>
      </div>

      <div className="panel">
        <p className="muted">What do you bid?</p>
        <BiddingBox legalOptions={options} selected={answers[q.id]} onSelect={submitBid} disabled={submitting} />
      </div>

      {attempt.status === 'submitted' ? (
        <div className="panel">
          <p className="muted">Answer key already set &mdash; click a bid above to change it for this question.</p>
          <Link className="btn secondary" to={homePath}>Back to dashboard</Link>
        </div>
      ) : (
        <div className="panel">
          <button type="button" className="nav-btn primary" disabled={!allAnswered || submitting} onClick={finishQuiz}>
            {allAnswered ? 'Submit quiz' : `Answer all questions to submit (${answeredCount}/${questions.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
