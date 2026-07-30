import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { getSessionUser } from '../lib/session.js';
import { legalBids } from '../lib/bidding.js';
import { dealHand, dealVulnerability } from '../lib/dealing.js';
import Hand from '../components/Hand.jsx';
import AuctionTable from '../components/AuctionTable.jsx';
import BiddingBox from '../components/BiddingBox.jsx';

export default function QuizTaking() {
  const { quizId } = useParams();
  const user = getSessionUser();
  const isTeacher = user.role === 'teacher';
  const navigate = useNavigate();
  const homePath = isTeacher ? '/teacher' : '/student';

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({}); // student: quiz_question_id -> bid_given
  const [acceptedByQuestion, setAcceptedByQuestion] = useState({}); // teacher: quiz_question_id -> Set(bid)
  const [viewIndex, setViewIndex] = useState(0);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [canModify, setCanModify] = useState(false); // teacher only: no student has answered the current question yet
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  useEffect(() => {
    if (isTeacher && questions && questions[viewIndex]) {
      checkCanModify(questions[viewIndex].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIndex, questions]);

  // A question already in a generated quiz can only be replaced/removed while
  // no student has answered it yet — otherwise we'd be silently invalidating
  // an answer someone already submitted.
  async function checkCanModify(questionId) {
    const { data, error } = await supabase
      .from('answers')
      .select('quiz_attempt_id, quiz_attempts!inner(user_id)')
      .eq('quiz_question_id', questionId);
    if (error) { setCanModify(false); return; }
    const answeredByStudent = data.some((a) => a.quiz_attempts.user_id !== user.id);
    setCanModify(!answeredByStudent);
  }

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

    if (attemptRow.status === 'submitted' && !isTeacher) {
      navigate(`/student/results/${quizId}`, { replace: true });
      return;
    }
    setAttempt(attemptRow);

    if (isTeacher) {
      // Teachers grade by toggling any number of acceptable bids per question,
      // so their "answer" is the full accepted_answers set, not a single pick.
      const questionIds = qRows.map((q) => q.id);
      const { data: acceptedRows, error: accErr } = await supabase
        .from('accepted_answers')
        .select('quiz_question_id, bid')
        .in('quiz_question_id', questionIds.length ? questionIds : ['00000000-0000-0000-0000-000000000000']);
      if (accErr) { setError(accErr.message); return; }
      const acceptedMap = {};
      for (const r of acceptedRows) {
        acceptedMap[r.quiz_question_id] = acceptedMap[r.quiz_question_id] || new Set();
        acceptedMap[r.quiz_question_id].add(r.bid);
      }
      setAcceptedByQuestion(acceptedMap);
      const firstUnanswered = qRows.findIndex((q) => !acceptedMap[q.id]?.size);
      setViewIndex(firstUnanswered === -1 ? qRows.length - 1 : firstUnanswered);
      return;
    }

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

  // Teacher only: toggle one bid on/off the accepted-answers set for the current
  // question. Multiple bids can be accepted at once; this doesn't touch any other
  // bid already accepted for this question (whether set by the teacher or granted
  // via a student challenge), and doesn't auto-advance since a teacher may want to
  // mark several bids before moving on.
  async function toggleAccepted(bid) {
    if (submitting || !questions) return;
    setSubmitting(true);
    setError(null);
    const q = questions[viewIndex];
    const currentSet = acceptedByQuestion[q.id] || new Set();
    const alreadyAccepted = currentSet.has(bid);

    if (alreadyAccepted) {
      const { error: delErr } = await supabase
        .from('accepted_answers')
        .delete()
        .eq('quiz_question_id', q.id)
        .eq('bid', bid);
      if (delErr) { setError(delErr.message); setSubmitting(false); return; }
    } else {
      const { error: insErr } = await supabase
        .from('accepted_answers')
        .upsert(
          { quiz_question_id: q.id, bid, source: 'teacher' },
          { onConflict: 'quiz_question_id,bid', ignoreDuplicates: true }
        );
      if (insErr) { setError(insErr.message); setSubmitting(false); return; }
    }

    const nextSet = new Set(currentSet);
    if (alreadyAccepted) nextSet.delete(bid); else nextSet.add(bid);
    setAcceptedByQuestion({ ...acceptedByQuestion, [q.id]: nextSet });
    setSubmitting(false);
  }

  async function clearQuestionData(questionId) {
    // Order matters: challenges reference answers, so clear those first, then the
    // answers themselves, then the accepted-answer key entries. canModify already
    // guarantees no student has answered (so no challenge should exist either),
    // but this is defensive against neither table having an ON DELETE CASCADE
    // from quiz_questions.
    const { error: chDelErr } = await supabase.from('challenges').delete().eq('quiz_question_id', questionId);
    if (chDelErr) return chDelErr.message;
    const { error: ansDelErr } = await supabase.from('answers').delete().eq('quiz_question_id', questionId);
    if (ansDelErr) return ansDelErr.message;
    const { error: accDelErr } = await supabase.from('accepted_answers').delete().eq('quiz_question_id', questionId);
    if (accDelErr) return accDelErr.message;
    return null;
  }

  async function replaceQuestion() {
    if (managing || !canModify || !questions) return;
    const q = questions[viewIndex];
    if (!window.confirm('Replace this question with a new random one? Its current board and any accepted answers will be discarded.')) return;
    setManaging(true);
    setError(null);

    const { data: pool, error: poolErr } = await supabase.from('question_templates').select('*');
    if (poolErr) { setError(poolErr.message); setManaging(false); return; }
    const choices = pool.filter((t) => t.id !== q.question_template_id);
    const tpl = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length ? choices.length : pool.length))];
    if (!tpl) { setError('No templates in the question bank to draw from.'); setManaging(false); return; }

    const clearErr = await clearQuestionData(q.id);
    if (clearErr) { setError(clearErr); setManaging(false); return; }

    const { error: updErr } = await supabase
      .from('quiz_questions')
      .update({
        question_template_id: tpl.id,
        dealt_hand: dealHand(tpl.min_hcp, tpl.max_hcp, tpl.shapes),
        vulnerability: dealVulnerability(),
      })
      .eq('id', q.id);
    if (updErr) { setError(updErr.message); setManaging(false); return; }

    setManaging(false);
    load();
  }

  async function removeQuestion() {
    if (managing || !canModify || !questions) return;
    const q = questions[viewIndex];
    if (questions.length <= 1) { setError("Can't remove the last remaining question in a quiz."); return; }
    if (!window.confirm('Remove this question from the quiz entirely? This can\'t be undone.')) return;
    setManaging(true);
    setError(null);

    const clearErr = await clearQuestionData(q.id);
    if (clearErr) { setError(clearErr); setManaging(false); return; }

    const { error: delErr } = await supabase.from('quiz_questions').delete().eq('id', q.id);
    if (delErr) { setError(delErr.message); setManaging(false); return; }

    setManaging(false);
    load();
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
    navigate(isTeacher ? homePath : `/student/results/${quizId}`);
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
  const answeredIds = isTeacher
    ? new Set(questions.filter((qq) => acceptedByQuestion[qq.id]?.size > 0).map((qq) => qq.id))
    : new Set(Object.keys(answers));
  const answeredCount = answeredIds.size;
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">Quiz {quiz.quiz_number} &middot; {quiz.quiz_date}</div>
        <div className="whoami">
          {user.name} {isTeacher && (attempt.status === 'submitted' ? '(reviewing answer key)' : '(setting answer key)')}
        </div>
      </div>

      <div className="progress-dots">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            type="button"
            className={`dot ${answeredIds.has(qq.id) ? 'done' : ''} ${i === viewIndex ? 'current' : ''}`}
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
        <p className="muted">{isTeacher ? 'Mark every acceptable bid (you can pick more than one)' : 'What do you bid?'}</p>
        {isTeacher ? (
          <BiddingBox
            legalOptions={options}
            selected={Array.from(acceptedByQuestion[q.id] || [])}
            onSelect={toggleAccepted}
            disabled={submitting}
          />
        ) : (
          <BiddingBox legalOptions={options} selected={answers[q.id]} onSelect={submitBid} disabled={submitting} />
        )}
      </div>

      {isTeacher && (
        <div className="panel">
          <p className="muted">
            {canModify
              ? 'Question looks wrong or buggy? Replace it with a new random one, or remove it from the quiz.'
              : "Can't modify — a student has already answered this question."}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="secondary" disabled={!canModify || managing} onClick={replaceQuestion}>
              Replace with a new question
            </button>
            <button className="danger" disabled={!canModify || managing} onClick={removeQuestion}>
              Remove from quiz
            </button>
          </div>
        </div>
      )}

      {isTeacher ? (
        attempt.status === 'submitted' ? (
          <div className="panel">
            <p className="muted">Answer key already set &mdash; click a bid above to add or remove it from the accepted answers.</p>
            <Link className="btn secondary" to={homePath}>Back to dashboard</Link>
          </div>
        ) : (
          <div className="panel">
            <button type="button" className="nav-btn primary" disabled={!allAnswered || submitting} onClick={finishQuiz}>
              {allAnswered ? 'Submit quiz' : `Mark at least one bid on every question to submit (${answeredCount}/${questions.length})`}
            </button>
          </div>
        )
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
