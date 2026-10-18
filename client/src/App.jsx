import React, { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:5000/api/session";

async function requestSession(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Can't reach the game server. Check that the server is running.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response. Check the server terminal.");
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data.error) || `The server returned an error (${response.status}).`
    );
  }
  if (!data || typeof data._id !== "string" || !Array.isArray(data.messages)) {
    throw new Error("The server response was not a valid game session.");
  }

  return data;
}

function jsonRequest(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  };
}

function getErrorMessage(error) {
  if (typeof error !== "string") {
    return "The server could not complete your request.";
  }

  try {
    const details = JSON.parse(error);
    if (typeof details?.error?.message === "string") {
      return details.error.message;
    }
    if (typeof details?.message === "string") {
      return details.message;
    }
  } catch {
    return error;
  }

  return error;
}

/**
 * Rule #2 Parser:
 * Splits a user's sent message into spoken text vs double-quoted actions ("...").
 * Any segment inside "..." is transformed into grey, cursive/italic text bounded by *...*
 */
function renderUserMessageWithActions(rawText) {
  if (!rawText) return null;
  // Match either *"..."* (skip turn) or "..." (user typed double quotes)
  const regex = /(\*"[^"]+"\*"|"[^"]+")/g;
  const parts = rawText.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;
    const isQuotedAction =
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith('*"') && part.endsWith('"*'));

    if (isQuotedAction) {
      const cleanAction = part.replace(/^(\*"|")|("\*|")$/g, "").trim();
      return (
        <span
          key={idx}
          className="block my-1 text-gray-300/80 italic font-serif tracking-wide"
        >
          *{cleanAction}*
        </span>
      );
    }
    return (
      <span key={idx} className="text-[#e9edef]">
        {part}
      </span>
    );
  });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Edit Last Message states
  const [isEditingLast, setIsEditingLast] = useState(false);
  const [editDraft, setEditDraft] = useState("");

  // Character Sidebar Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [npcName, setNpcName] = useState("");
  const [npcRole, setNpcRole] = useState("");
  const [npcPersonality, setNpcPersonality] = useState("");

  const chatEndRef = useRef(null);

  useEffect(() => {
    const savedId = localStorage.getItem("xaviers_session_id");
    if (savedId) {
      requestSession("/init", jsonRequest("POST", { sessionId: savedId }))
        .then((data) => {
          setSession(data);
        })
        .catch((requestError) => {
          localStorage.removeItem("xaviers_session_id");
          setError(requestError.message);
        });
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, loading]);

  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!playerNameInput.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestSession(
        "/init",
        jsonRequest("POST", { playerName: playerNameInput.trim() })
      );
      localStorage.setItem("xaviers_session_id", data._id);
      setSession(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (isSkip = false) => {
    if (loading) return;
    if (!isSkip && !messageInput.trim()) return;

    const textToSend = messageInput;
    if (!isSkip) setMessageInput("");
    setLoading(true);
    setError("");

    try {
      const data = await requestSession(
        `/${session._id}/message`,
        jsonRequest("POST", { text: textToSend, isSkip })
      );
      setSession(data);
    } catch (requestError) {
      if (!isSkip) setMessageInput(textToSend);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editDraft.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestSession(
        `/${session._id}/edit-last`,
        jsonRequest("PUT", { newText: editDraft })
      );
      setSession(data);
      setIsEditingLast(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestSession(
        `/${session._id}/regenerate`,
        jsonRequest("POST")
      );
      setSession(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCharacter = async (e) => {
    e.preventDefault();
    if (!npcName.trim() || !npcRole.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestSession(
        `/${session._id}/characters`,
        jsonRequest("POST", {
          name: npcName.trim(),
          role: npcRole.trim(),
          personality: npcPersonality.trim() || "Dynamic college character"
        })
      );
      setSession(data);
      setNpcName("");
      setNpcRole("");
      setNpcPersonality("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  // --- ONBOARDING SCREEN (No Hardcoded Name) ---
  if (!session) {
    return (
      <div className="onboarding-shell min-h-screen bg-[#0b141a] text-[#e9edef] flex items-center justify-center p-4">
        <div className="onboarding-card max-w-md w-full bg-[#111b21] border border-[#2a3942] rounded-2xl overflow-hidden shadow-2xl">
          <div className="onboarding-art relative h-60 w-full overflow-hidden">
            <img
              src="/isha-scene.jpg"
              alt="Xavier's College"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111b21] via-transparent to-black/40" />
            <div className="absolute bottom-3 left-4 right-4">
              <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-rose-600/90 text-white rounded-full">
                Xavier&apos;s College Sandbox
              </span>
              <h1 className="text-2xl font-bold mt-1 text-white drop-shadow">
                Crown of Thorns: Isha
              </h1>
            </div>
          </div>

          <form onSubmit={handleStartSession} className="onboarding-form p-6 space-y-4">
            <p className="text-sm text-[#8696a0] leading-relaxed">
              You are a new admission student walking into <strong className="text-gray-200">Xavier&apos;s College</strong>.
              Isha—brilliant, wealthy, and fiercely arrogant—rules this campus. Nothing is scripted.
            </p>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#8696a0] mb-1.5">
                Enter Your Name (New Admission)
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Aryan, Kabir, or your name..."
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                className="w-full bg-[#202c33] text-white px-4 py-3 rounded-xl border border-[#2a3942] focus:outline-none focus:border-[#00a884]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00a884] hover:bg-[#029072] text-[#111b21] font-bold py-3 rounded-xl transition"
            >
              {loading ? "Entering Xavier's Corridor..." : "Enter Xavier's College →"}
            </button>
            {error && <p className="error-banner" role="alert">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  const lastUserIndex = session.messages.length - 2;
  const lastAiIndex = session.messages.length - 1;

  return (
    <div className="app-shell h-screen w-full bg-[#0b141a] text-[#e9edef] flex justify-center overflow-hidden">
      {/* Main Responsive Mobile/Desktop Container */}
      <div className="app-frame relative w-full max-w-2xl h-full flex flex-col bg-[#0b141a] border-x border-[#222d34]">
        {/* 1. CUSTOM PROJECT HEADER */}
        <header className="app-header bg-[#202c33] px-4 py-2.5 flex items-center justify-between border-b border-[#2a3942] z-10">
          <div className="header-identity flex items-center gap-3">
            {/* Circular Avatar cropped onto Isha's face from the uploaded Xavier's image */}
            <div className="brand-avatar w-11 h-11 rounded-full overflow-hidden border-2 border-rose-500/70 shrink-0">
              <img
                src="/isha-scene.jpg"
                alt="Isha"
                className="w-full h-full object-cover object-[76%_22%] scale-150"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="brand-title font-bold text-[16px] tracking-tight text-white">
                  XAVIER&apos;S // ISHA
                </h2>
                <span className="player-badge text-[11px] px-2 py-0.5 rounded bg-[#111b21] text-[#8696a0]">
                  Player: {session.playerName}
                </span>
              </div>
              {/* Global Constant Love & Hate Bar */}
              <div className="score-row flex items-center gap-3 text-xs mt-0.5">
                <span className="text-rose-400 font-semibold">
                  ❤️ Love: {session.love}/100
                </span>
                <span className="text-gray-500">|</span>
                <span className="text-amber-400 font-semibold">
                  🔥 Hate: {session.hate}/100
                </span>
              </div>
            </div>
          </div>

          {/* Unified Scene Cast Drawer Toggle */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[#111b21] hover:bg-[#2a3942] text-xs font-medium text-[#00a884] border border-[#2a3942] transition"
          >
            👥 Cast ({session.characters?.length ?? 0})
          </button>
        </header>

        {/* 2. WHATSAPP CLASSIC DARK CHAT STREAM */}
        <main
          className="story-stream flex-1 overflow-y-auto p-4 space-y-3"
          style={{
            backgroundColor: "#0b141a",
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 0)",
            backgroundSize: "24px 24px"
          }}
        >
          {session.messages.map((msg, index) => {
            const isUser = msg.sender === "user";
            const isLastUserMsg = isUser && index === lastUserIndex && index > 0;
            const isLastAiMsg = !isUser && index === lastAiIndex && index > 0;

            if (isUser) {
              return (
                <div key={index} className="message-row user-row flex flex-col items-end">
                  <div className="message-bubble user-bubble max-w-[82%] bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-none px-3.5 py-2 shadow-md text-[15px] leading-snug">
                    {isEditingLast && isLastUserMsg ? (
                      <div className="space-y-2 min-w-[240px]">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={2}
                          className="w-full bg-[#074237] text-white p-2 rounded text-sm focus:outline-none"
                        />
                        <div className="flex justify-end gap-2 text-xs">
                          <button
                            onClick={() => setIsEditingLast(false)}
                            className="px-2 py-1 rounded bg-black/30 text-gray-300"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            className="px-2.5 py-1 rounded bg-[#00a884] text-black font-semibold"
                          >
                            Save & Regenerate
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>{renderUserMessageWithActions(msg.rawInput)}</div>
                    )}
                  </div>

                  {/* Rule #9: Edit Last Message Button */}
                  {isLastUserMsg && !isEditingLast && !loading && (
                    <button
                      onClick={() => {
                        setEditDraft(msg.rawInput);
                        setIsEditingLast(true);
                      }}
                      className="text-[11px] text-[#8696a0] hover:text-white mt-1 mr-1 flex items-center gap-1"
                    >
                      ✏️ Edit last message
                    </button>
                  )}
                </div>
              );
            }

            // AI / Multi-Character Message Bubble
            return (
              <div key={index} className="message-row ai-row flex flex-col items-start">
                <div className="message-bubble ai-bubble max-w-[88%] bg-[#202c33] text-[#e9edef] rounded-2xl rounded-tl-none px-4 py-3 shadow-md space-y-2.5 border border-[#2a3942]/60">
                  {/* Pinned Constant Love & Hate Header Inside Every Turn */}
                  <div className="flex items-center justify-between border-b border-[#2a3942] pb-1.5 text-xs font-semibold">
                    <div className="flex items-center gap-4">
                      <span className="text-rose-400">
                        ❤️ Love: {msg.loveScore}/100
                      </span>
                      <span className="text-red-400">
                        💔 Hate: {msg.hateScore}/100
                      </span>
                    </div>
                    {msg.loveDelta !== 0 && (
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded ${
                          msg.loveDelta > 0
                            ? "bg-emerald-950 text-emerald-400"
                            : "bg-red-950 text-red-400"
                        }`}
                      >
                        {msg.loveDelta > 0 ? `+${msg.loveDelta} Love` : `${msg.loveDelta} Love`}
                      </span>
                    )}
                  </div>

                  {/* Narration (*...*) & Multi-Character Dialogues */}
                  {(Array.isArray(msg.blocks) ? msg.blocks : []).map((block, bIdx) =>
                    block.type === "narration" ? (
                      <p
                        key={bIdx}
                        className="scene-narration text-[#9aa6af] italic font-serif text-[14.5px] leading-relaxed"
                      >
                        *{block.text}*
                      </p>
                    ) : (
                      <p key={bIdx} className="scene-dialogue text-[#e9edef] text-[15px] leading-snug">
                        <strong
                          className={
                            block.speaker?.toLowerCase() === "isha"
                              ? "text-rose-400"
                              : "text-sky-400"
                          }
                        >
                          {block.speaker}:
                        </strong>{" "}
                        &ldquo;{block.text}&rdquo;
                      </p>
                    )
                  )}
                </div>

                {/* Rule #9: Regenerate Last AI Response Button */}
                {isLastAiMsg && !loading && (
                  <button
                    onClick={handleRegenerate}
                    className="text-[11px] text-[#8696a0] hover:text-[#00a884] mt-1 ml-1 flex items-center gap-1"
                  >
                    🔄 Regenerate response
                  </button>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="bg-[#202c33] text-[#8696a0] text-xs italic px-4 py-2.5 rounded-2xl rounded-tl-none w-fit animate-pulse">
              *Isha aur aas-paas ke log react kar rahe hain...*
            </div>
          )}
          <div ref={chatEndRef} />
        </main>

        {/* 3. BOTTOM INPUT BAR + DOUBLE-QUOTE ACTION HINT + SKIP BUTTON */}
        <footer className="chat-footer bg-[#202c33] px-3 py-2 border-t border-[#2a3942]">
          {error && <p className="error-banner" role="alert">{error}</p>}
          <div className="composer-hint text-[11px] text-[#8696a0] mb-1.5 px-1 flex justify-between">
            <span>
              💡 Tip: Put actions in <code className="text-gray-300">&quot;double quotes&quot;</code> to send as{" "}
              <em className="text-gray-400">*italic actions*</em>
            </span>
          </div>

          <div className="composer-row flex items-center gap-2">
            {/* Rule #8: Skip Button for next action/conversation from other side */}
            <button
              type="button"
              onClick={() => handleSend(true)}
              disabled={loading}
              title="Skip your turn and let Isha / NPCs continue the scene"
              className="skip-button px-3 py-2.5 rounded-full bg-[#111b21] hover:bg-[#2a3942] text-xs font-semibold text-amber-400 border border-[#2a3942] shrink-0 transition"
            >
              ⏭️ Skip
            </button>

            <input
              type="text"
              placeholder='Type dialogue or "action in double quotes"...'
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(false);
                }
              }}
              className="composer-input flex-1 bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] px-4 py-2.5 rounded-full text-sm focus:outline-none"
            />

            <button
              type="button"
              onClick={() => handleSend(false)}
              disabled={loading || !messageInput.trim()}
              className="send-button w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#029072] disabled:opacity-40 text-[#111b21] flex items-center justify-center font-bold shrink-0 transition"
            >
              ➤
            </button>
          </div>
        </footer>

        {/* 4. UNIFIED SCENE CHARACTER ROSTER DRAWER (Rule #7) */}
        {drawerOpen && (
          <div className="cast-overlay absolute inset-0 bg-black/70 z-20 flex justify-end">
            <div className="cast-panel w-80 bg-[#111b21] h-full p-4 flex flex-col border-l border-[#2a3942] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-[#2a3942]">
                <h3 className="font-bold text-white text-sm">
                  Xavier&apos;s World Characters
                </h3>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#8696a0] mt-2 mb-3">
                All characters act voluntarily or involuntarily inside the <strong>single main chat</strong> based on the scenario.
              </p>

              <div className="space-y-2.5 flex-1 overflow-y-auto">
                {(session.characters ?? []).map((c, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-[#202c33] border border-[#2a3942] text-xs"
                  >
                    <div className="font-bold text-white">{c.name}</div>
                    <div className="text-[#00a884] text-[11px]">{c.role}</div>
                    <div className="text-[#8696a0] mt-1">{c.personality}</div>
                  </div>
                ))}
              </div>

              {/* Add Custom NPC Form */}
              <form
                onSubmit={handleAddCharacter}
                className="mt-4 pt-3 border-t border-[#2a3942] space-y-2"
              >
                <div className="text-xs font-semibold text-white">
                  + Introduce New NPC to World
                </div>
                <input
                  type="text"
                  placeholder="Name (e.g., Commander Harvinder)"
                  value={npcName}
                  onChange={(e) => setNpcName(e.target.value)}
                  className="w-full bg-[#202c33] text-xs px-3 py-2 rounded-lg text-white focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Role (e.g., Principal / Rival / Guard)"
                  value={npcRole}
                  onChange={(e) => setNpcRole(e.target.value)}
                  className="w-full bg-[#202c33] text-xs px-3 py-2 rounded-lg text-white focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Personality / Attitude"
                  value={npcPersonality}
                  onChange={(e) => setNpcPersonality(e.target.value)}
                  className="w-full bg-[#202c33] text-xs px-3 py-2 rounded-lg text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full bg-[#00a884] text-[#111b21] font-bold text-xs py-2 rounded-lg"
                >
                  Add to Active World
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}