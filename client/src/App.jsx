import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endOfMessages = useRef(null);

  const loadSessions = useCallback(async () => {
    try {
      const items = await request("/sessions");
      setSessions(items);
      if (items.length) {
        const session = await request(`/sessions/${items[0]._id}`);
        setActiveSession(session);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, sending]);

  async function startNewChat() {
    setError("");
    try {
      const session = await request("/sessions", { method: "POST" });
      setActiveSession(session);
      setSessions((items) => [{ _id: session._id, title: session.title }, ...items]);
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function selectSession(id) {
    setError("");
    try {
      setActiveSession(await request(`/sessions/${id}`));
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setDraft("");
    setError("");
    setSending(true);
    try {
      let session = activeSession;
      if (!session) {
        session = await request("/sessions", { method: "POST" });
        setActiveSession(session);
        setSessions((items) => [{ _id: session._id, title: session.title }, ...items]);
      }
      const result = await request(`/sessions/${session._id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setActiveSession(result.session);
      setSessions((items) =>
        items
          .map((item) =>
            item._id === result.session._id
              ? { ...item, title: result.session.title }
              : item
          )
          .sort((a, b) => {
            if (a._id === result.session._id) return -1;
            if (b._id === result.session._id) return 1;
            return 0;
          })
      );
    } catch (sendError) {
      setDraft(text);
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Classmate home">
          <span className="brand-mark">✳</span>
          <span>classmate</span>
        </a>
        <button className="new-chat" onClick={startNewChat}>
          <span aria-hidden="true">＋</span> New conversation
        </button>
        <p className="sidebar-label">YOUR CHATS</p>
        <nav className="session-list" aria-label="Your chat sessions">
          {sessions.map((session) => (
            <button
              className={`session-link ${activeSession?._id === session._id ? "selected" : ""}`}
              key={session._id}
              onClick={() => selectSession(session._id)}
              title={session.title}
            >
              <span aria-hidden="true">◷</span>
              <span className="session-title">{session.title || "New chat"}</span>
            </button>
          ))}
          {!sessions.length && !loading && (
            <p className="empty-sidebar">Your conversations will show up here.</p>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">C</span>
          <span>
            <strong>Study space</strong>
            <small>Your personal AI companion</small>
          </span>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div className="topbar-status"><span className="online-dot" /> AI study partner</div>
          <span className="topbar-caption">Here to help you learn</span>
        </header>

        <div className="conversation">
          {loading ? (
            <div className="welcome">
              <span className="welcome-icon">✳</span>
              <h1>Getting your study space ready...</h1>
            </div>
          ) : activeSession?.messages?.length ? (
            <div className="messages">
              {activeSession.messages.map((message, index) => (
                <article className={`message ${message.role}`} key={message._id || index}>
                  {message.role === "model" && <span className="message-avatar">✳</span>}
                  <div className="message-content">
                    <span className="message-author">
                      {message.role === "user" ? "You" : "Classmate"}
                    </span>
                    <p>{message.text}</p>
                  </div>
                </article>
              ))}
              {sending && (
                <article className="message model">
                  <span className="message-avatar">✳</span>
                  <div className="message-content">
                    <span className="message-author">Classmate</span>
                    <p className="typing" aria-label="Classmate is thinking"><i /><i /><i /></p>
                  </div>
                </article>
              )}
              <div ref={endOfMessages} />
            </div>
          ) : (
            <div className="welcome">
              <span className="welcome-icon">✳</span>
              <p className="eyebrow">YOUR STUDY SIDEKICK</p>
              <h1>What are we learning today?</h1>
              <p className="welcome-copy">
                Ask a question, work through a tricky topic, or get help getting started.
              </p>
              <div className="suggestions">
                {["Explain a tough concept", "Help me study for a test", "Review my notes"].map(
                  (suggestion) => (
                    <button key={suggestion} onClick={() => setDraft(suggestion)}>
                      {suggestion}<span aria-hidden="true">↗</span>
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {error && <p className="error-banner" role="alert">{error}</p>}
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              aria-label="Message Classmate"
              placeholder="Ask anything about what you're studying..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              rows={2}
            />
            <div className="composer-bottom">
              <span>AI can make mistakes. Check important information.</span>
              <button
                className="send-button"
                type="submit"
                disabled={!draft.trim() || sending || loading}
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
          </form>
          <p className="composer-hint">Press Enter to send · Shift + Enter for a new line</p>
        </div>
      </section>
    </main>
  );
}

export default App;
