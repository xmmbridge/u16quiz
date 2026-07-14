import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

/**
 * One conversation thread about a single board, scoped to (quizQuestionId, studentId).
 * Works for both sides: a student asking about their own board, or a teacher replying
 * to a specific student's thread. The thread row is created lazily on first message.
 */
export default function QAThread({ quizQuestionId, studentId, currentUser, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [loaded, setLoaded] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && !loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    setError(null);
    const { data: thread, error: tErr } = await supabase
      .from('board_qa_threads')
      .select('id')
      .eq('quiz_question_id', quizQuestionId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (tErr) { setError(tErr.message); return; }
    if (!thread) {
      setThreadId(null);
      setMessages([]);
      setLoaded(true);
      return;
    }
    setThreadId(thread.id);
    const { data: msgs, error: mErr } = await supabase
      .from('board_qa_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at');
    if (mErr) { setError(mErr.message); return; }
    setMessages(msgs);
    setLoaded(true);
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    let tId = threadId;
    if (!tId) {
      const { data: created, error: cErr } = await supabase
        .from('board_qa_threads')
        .insert({ quiz_question_id: quizQuestionId, student_id: studentId })
        .select('id')
        .single();
      if (cErr) { setError(cErr.message); setSending(false); return; }
      tId = created.id;
      setThreadId(tId);
    }

    const { error: mErr } = await supabase.from('board_qa_messages').insert({
      thread_id: tId,
      sender_id: currentUser.id,
      sender_role: currentUser.role,
      body,
    });
    if (mErr) { setError(mErr.message); setSending(false); return; }

    setDraft('');
    setSending(false);
    load();
  }

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        Q&amp;A
      </button>
    );
  }

  return (
    <div className="qa-thread">
      {error && <p className="warn-banner">{error}</p>}
      {!loaded && <p className="muted">Loading...</p>}
      {loaded && (
        <>
          {messages.length === 0 && <p className="muted">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`qa-bubble ${m.sender_role}`}>
              <div className="qa-bubble-meta">{m.sender_role === 'teacher' ? 'Teacher' : 'Student'}</div>
              <div className="qa-bubble-body">{m.body}</div>
            </div>
          ))}
        </>
      )}
      <div className="qa-compose">
        <textarea
          rows={2}
          placeholder={currentUser.role === 'teacher' ? 'Reply to student' : 'Ask a question about this board'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="button" onClick={send} disabled={sending || !draft.trim()}>Send</button>
      </div>
    </div>
  );
}
