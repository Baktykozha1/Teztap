const { saveChatMessage, getChatHistory } = require("../database");
const { effectivePlan } = require("../../shared/access");

async function loadConversationMemory({ user, limit = 14 }) {
  if (!user?.id) {
    return [];
  }

  const history = await getChatHistory({ userId: user.id, limit, accessTier: user.role === "ADMIN" ? "ADMIN" : effectivePlan(user) });
  return normalizeMessages(history);
}

async function saveConversationMessage({ user, analysisId, role, content }) {
  if (!user?.id || !content) {
    return null;
  }

  return saveChatMessage({
    userId: user.id,
    analysisId,
    role,
    accessTier: user.role === "ADMIN" ? "ADMIN" : effectivePlan(user),
    content: String(content).slice(0, 4000)
  });
}

function buildMemoryContext({ history = [], incomingMessages = [] }) {
  const normalizedHistory = normalizeMessages(history).slice(-10);
  const normalizedIncoming = normalizeMessages(incomingMessages).slice(-8);
  const conversationWindow = [...normalizedHistory, ...normalizedIncoming];
  const recentUserQuestions = [...normalizedHistory, ...normalizedIncoming]
    .filter((message) => message.role === "user")
    .slice(-5)
    .map((message) => message.content);
  const entities = extractConversationEntities(conversationWindow);

  return {
    persistedMessages: normalizedHistory,
    incomingMessages: normalizedIncoming,
    entities,
    recentUserQuestions,
    summary: recentUserQuestions.length
      ? `Recent user questions: ${recentUserQuestions.join(" | ")}. Remembered context: ${formatEntitySummary(entities)}`
      : "No recent user questions are available.",
    rule: "Memory preserves intent and continuity only. It can resolve follow-up references, but it cannot create analytics evidence or override calculated metrics."
  };
}

function extractConversationEntities(messages) {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" \n ");
  const budgetMentions = extractBudgets(userText);
  const businessMentions = extractBusinessMentions(userText);
  const districtMentions = extractDistrictMentions(userText);

  return {
    latestBudget: budgetMentions.at(-1) || null,
    budgetMentions,
    latestBusinessFocus: businessMentions.at(-1) || null,
    businessMentions,
    latestDistrictFocus: districtMentions.at(-1) || null,
    districtMentions,
    hasFollowUpSignal: /\b(what if|later|increase|decrease|instead|same|that|there|it|budget)\b/i.test(userText)
  };
}

function extractBudgets(text) {
  const budgets = [];
  const pattern = /(\d+(?:[.,]\d+)?)\s*(million|m|mln|k)?\s*(kzt|\u20b8|tenge)?/gi;
  let match;

  while ((match = pattern.exec(text))) {
    const raw = Number(String(match[1]).replace(",", "."));
    const suffix = String(match[2] || "").toLowerCase();

    if (!Number.isFinite(raw)) {
      continue;
    }

    const value = suffix === "million" || suffix === "m" || suffix === "mln"
      ? raw * 1000000
      : suffix === "k"
        ? raw * 1000
        : raw >= 100000 ? raw : null;

    if (value) {
      budgets.push(Math.round(value));
    }
  }

  return budgets.slice(-5);
}

function extractBusinessMentions(text) {
  const labels = [
    ["coffee_shop", /\b(coffee shop|coffee shops|cafe|cafes|coffee)\b/i],
    ["dessert_cafe", /\b(dessert cafe|dessert cafes|dessert|bakery|pastry)\b/i],
    ["grocery", /\b(grocery|groceries|market|supermarket|food store)\b/i],
    ["pharmacy", /\b(pharmacy|drugstore)\b/i],
    ["fitness", /\b(fitness|gym)\b/i],
    ["beauty_salon", /\b(beauty salon|salon|barber|hair)\b/i],
    ["restaurant", /\b(restaurant|restaurants|dining)\b/i]
  ];

  return labels
    .filter(([, pattern]) => pattern.test(text))
    .map(([value]) => value);
}

function extractDistrictMentions(text) {
  const districts = [];
  const pattern = /\b(\d{1,2}(?:st|nd|rd|th)?\s+microdistrict|[A-Z][A-Za-z'-]+\s+district)\b/g;
  let match;

  while ((match = pattern.exec(text))) {
    districts.push(match[1]);
  }

  return districts.slice(-5);
}

function formatEntitySummary(entities) {
  const parts = [
    entities.latestBusinessFocus ? `businessFocus=${entities.latestBusinessFocus}` : null,
    entities.latestBudget ? `budget=${entities.latestBudget} KZT` : null,
    entities.latestDistrictFocus ? `district=${entities.latestDistrictFocus}` : null
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "none";
}

function normalizeMessages(messages) {
  return (messages || [])
    .filter((message) => message && ["user", "assistant", "system"].includes(message.role) && message.content)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 4000),
      createdAt: message.createdAt || null
    }));
}

module.exports = {
  loadConversationMemory,
  saveConversationMessage,
  buildMemoryContext
};
