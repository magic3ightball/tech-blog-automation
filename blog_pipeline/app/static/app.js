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
const candidatePanel = document.querySelector("#candidatePanel");
const candidateList = document.querySelector("#candidateList");
const hideCandidatesButton = document.querySelector("#hideCandidatesButton");

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

function renderCandidates(candidates) {
  candidateList.innerHTML = "";

  if (!candidates.length) {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = "No candidates found for this session.";
    candidateList.append(notice);
    return;
  }

  for (const candidate of candidates) {
    const card = document.createElement("article");
    card.className = "candidate-card";

    const header = document.createElement("div");
    header.className = "candidate-card-header";

    const titleGroup = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = candidate.topic_hint || "Untitled candidate";
    const meta = document.createElement("p");
    meta.className = "session-meta";
    meta.textContent = `Score ${candidate.score} · Risk ${candidate.risk_level} · Turns ${candidate.turn_start} to ${candidate.turn_end}`;
    titleGroup.append(title, meta);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save to Obsidian";
    saveButton.addEventListener("click", () => saveCandidate(candidate, saveButton));

    header.append(titleGroup, saveButton);

    const reason = document.createElement("p");
    reason.className = "candidate-reason";
    reason.textContent = candidate.why_publishable;

    const summary = document.createElement("p");
    summary.className = "candidate-summary";
    summary.textContent = candidate.summary;

    card.append(header, reason, summary);
    candidateList.append(card);
  }
}

async function extractCandidates() {
  if (!state.selectedSessionId) return;

  extractButton.disabled = true;
  extractButton.textContent = "Extracting";

  const response = await fetch(`/api/sessions/${encodeURIComponent(state.selectedSessionId)}/extract`, {
    method: "POST",
  });

  if (!response.ok) {
    candidateList.innerHTML = '<div class="notice">Could not extract candidates.</div>';
    candidatePanel.classList.remove("hidden");
    extractButton.disabled = false;
    extractButton.textContent = "Extract candidates";
    return;
  }

  const payload = await response.json();
  renderCandidates(payload.candidates || []);
  candidatePanel.classList.remove("hidden");
  extractButton.disabled = false;
  extractButton.textContent = "Extract candidates";
}

async function saveCandidate(candidate, button) {
  button.disabled = true;
  button.textContent = "Saving";

  const response = await fetch("/api/candidates/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: state.selectedSessionId,
      candidate_id: candidate.candidate_id,
    }),
  });

  if (!response.ok) {
    button.disabled = false;
    button.textContent = "Save to Obsidian";
    return;
  }

  const payload = await response.json();
  button.textContent = "Saved";
  button.dataset.savedPath = payload.path;
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
  candidatePanel.classList.add("hidden");
  candidateList.innerHTML = "";
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
extractButton.addEventListener("click", extractCandidates);
hideCandidatesButton.addEventListener("click", () => candidatePanel.classList.add("hidden"));

loadSessions();
