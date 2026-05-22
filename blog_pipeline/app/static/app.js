const state = {
  sessions: [],
  selectedSessionId: null,
};

const sessionList = document.querySelector("#sessionList");
const sessionCount = document.querySelector("#sessionCount");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");
const emptyState = document.querySelector("#emptyState");
const sessionDetail = document.querySelector("#sessionDetail");
const detailDate = document.querySelector("#detailDate");
const detailTitle = document.querySelector("#detailTitle");
const detailCwd = document.querySelector("#detailCwd");
const messageList = document.querySelector("#messageList");
const extractButton = document.querySelector("#extractButton");

function formatDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function filteredSessions() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return state.sessions;

  return state.sessions.filter((session) => {
    const haystack = [
      session.title_hint,
      session.first_user_message,
      session.cwd,
      session.session_id,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderSessions() {
  const sessions = filteredSessions();
  sessionCount.textContent = `${sessions.length} sessions`;
  sessionList.innerHTML = "";

  for (const session of sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-item";
    if (session.session_id === state.selectedSessionId) {
      button.classList.add("active");
    }

    const title = document.createElement("p");
    title.className = "session-title";
    title.textContent = session.title_hint || "Untitled session";

    const meta = document.createElement("p");
    meta.className = "session-meta";
    meta.textContent = `${formatDate(session.started_at)} · ${session.user_message_count} user messages`;

    const cwd = document.createElement("p");
    cwd.className = "session-meta";
    cwd.textContent = session.cwd || "No workspace";

    button.append(title, meta, cwd);
    button.addEventListener("click", () => selectSession(session.session_id));
    sessionList.append(button);
  }
}

function renderMessages(messages) {
  messageList.innerHTML = "";

  for (const message of messages) {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;

    const role = document.createElement("p");
    role.className = "message-role";
    role.textContent = message.role;

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;

    article.append(role, text);
    messageList.append(article);
  }
}

async function selectSession(sessionId) {
  state.selectedSessionId = sessionId;
  renderSessions();

  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    messageList.innerHTML = '<div class="notice">Could not load this session.</div>';
    return;
  }

  const session = await response.json();
  emptyState.classList.add("hidden");
  sessionDetail.classList.remove("hidden");
  detailDate.textContent = formatDate(session.started_at);
  detailTitle.textContent = session.title_hint || "Untitled session";
  detailCwd.textContent = session.cwd || "No workspace";
  extractButton.disabled = false;
  renderMessages(session.messages || []);
}

async function loadSessions() {
  const response = await fetch("/api/sessions");
  state.sessions = await response.json();
  renderSessions();
}

async function refreshIndex() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing";
  await fetch("/api/reindex", { method: "POST" });
  await loadSessions();
  refreshButton.disabled = false;
  refreshButton.textContent = "Refresh";
}

searchInput.addEventListener("input", renderSessions);
refreshButton.addEventListener("click", refreshIndex);
extractButton.addEventListener("click", () => {
  alert("Candidate extraction is the next implementation step.");
});

loadSessions();
