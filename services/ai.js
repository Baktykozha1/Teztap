const { buildAnalyticsContext } = require("./ai/analyticsContext");
const { loadConversationMemory, saveConversationMessage, buildMemoryContext } = require("./ai/memoryManager");
const { getAnalysisById, listAnalyses } = require("./database");
const { projectAnalysis } = require("./access");
const {
  buildConsultantSystemPrompt,
  buildAnalyticsContextPrompt,
  buildOrchestrationPrompt,
  buildHybridControlPrompt
} = require("./ai/promptBuilder");
const {
  classifyConsultantIntent: classifyConsultantIntentFromModule,
  buildRecommendationEvidence,
  buildResponseIntelligence,
  buildAiConfidence,
  buildUnderservedMarketDetection,
  buildComparativeSimulations
} = require("./ai/recommendationEngine");

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const geminiFallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-flash-latest")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const geminiUrl = process.env.GEMINI_GENERATE_CONTENT_URL || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);
const DIRECT_GEMINI_CHAT = false;

async function createChatReply({ messages, analysis, user, language = "en", analysisId = null, requestContext = null }) {
  const persistedAnalysis = await loadPersistedAnalysisForChat({ user, analysisId: analysisId || analysis?.analysisId, useLatestWhenMissing: true });
  if ((analysisId || analysis?.analysisId) && !persistedAnalysis) throw Object.assign(new Error("Analysis not found"), { status: 404 });
  const activeAnalysis = projectAnalysis(persistedAnalysis?.result || null, user);
  const activeAnalysisId = persistedAnalysis?.id || analysisId || null;
  const incomingMessages = normalizeMessages(messages || []);
  const incomingLatestUserMessage = [...incomingMessages].reverse().find((message) => message.role === "user");
  const responseLanguage = detectMessageLanguage(incomingLatestUserMessage?.content) || language;
  const hasDiscoveryContext = Boolean(requestContext?.discoveryContext?.request || requestContext?.discoveryContext?.records?.length);
  const history = await loadConversationMemory({ user, limit: 14 });
  const memoryContext = buildMemoryContext({ history, incomingMessages: messages || [] });
  const conversation = DIRECT_GEMINI_CHAT
    ? sanitizeDirectGeminiConversation(messages)
    : hasDiscoveryContext
      ? normalizeMessages(messages || []).slice(-8)
      : normalizeMessages([...(history || []), ...(messages || [])]).slice(-16);
  const latestUserMessage = [...conversation].reverse().find((message) => message.role === "user");
  // Business context is sent to Gemini as data, never as a prewritten answer.
  const conversationMode = DIRECT_GEMINI_CHAT
    ? "general_conversation"
    : hasDiscoveryContext
      ? "directory_discovery"
      : classifyConversationMode(latestUserMessage?.content, conversation, Boolean(activeAnalysis));
  const analyticsContext = buildAnalyticsContext(activeAnalysis);
  const aiConfidence = buildAiConfidence({ analysis: activeAnalysis, analyticsContext });
  const underservedMarketDetection = buildUnderservedMarketDetection({ analysis: activeAnalysis, analyticsContext });
  const comparativeSimulations = buildComparativeSimulations({ analysis: activeAnalysis, analyticsContext });
  const orchestration = buildAiOrchestrationLayer({
    analysis: activeAnalysis,
    analyticsContext,
    aiConfidence,
    underservedMarketDetection,
    comparativeSimulations,
    user,
    analysisId: activeAnalysisId,
    language: responseLanguage,
    history,
    memoryContext,
    requestContext,
    messages,
    conversation,
    latestUserMessage
  });
  const consultantBrief = buildHybridConsultantBrief({
    question: latestUserMessage?.content,
    analysis: activeAnalysis,
    language: responseLanguage,
    orchestration,
    analyticsContext,
    mode: conversationMode
  });
  const responseIntelligence = buildResponseIntelligence({
    analysis: activeAnalysis,
    analyticsContext,
    consultantBrief
  });

  if (user?.id && latestUserMessage?.content) {
    await saveConversationMessage({
      user,
      analysisId: activeAnalysisId,
      role: "user",
      content: latestUserMessage.content
    });
  }

  let reply;
  let provider = "hybrid-local-analytics";
  const directGeneralReply = conversationMode === "general_conversation"
    ? buildDirectGeneralReply(incomingLatestUserMessage?.content || latestUserMessage?.content, responseLanguage)
    : null;

  if (directGeneralReply) {
    reply = directGeneralReply;
    provider = "local-conversational";
  } else if (geminiApiKey) {
    try {
      reply = await requestGeminiReply({ conversation, analysis: activeAnalysis, analyticsContext, language: responseLanguage, consultantBrief, orchestration, requestContext });
      provider = conversationMode === "general_conversation" ? "gemini-conversational" : conversationMode === "directory_discovery" ? "gemini-directory-recommendation" : "hybrid-gemini-grounded";
    } catch (error) {
      console.warn(`[ai] Gemini unavailable: ${error.message}`);
      reply = buildGeminiUnavailableReply(responseLanguage);
    }
  } else {
    reply = buildGeminiUnavailableReply(responseLanguage);
  }

  if (conversationMode === "business_analytics") {
    reply = enforceQuestionSpecificGuardrails({
      reply,
      question: latestUserMessage?.content,
      analysis: activeAnalysis,
      language: responseLanguage
    });
  }
  reply = cleanGeminiReply(reply, conversationMode);

  if (user?.id && reply) {
    await saveConversationMessage({
      user,
      analysisId: activeAnalysisId,
      role: "assistant",
      content: reply
    });
  }

  return {
    aiMessage: reply,
    reply,
    insights: responseIntelligence.insights,
    confidenceScore: responseIntelligence.confidenceScore,
    linkedAnalytics: responseIntelligence.linkedAnalytics,
    recommendedDistricts: responseIntelligence.recommendedDistricts,
    riskFactors: responseIntelligence.riskFactors,
    aiConfidence: responseIntelligence.aiConfidence,
    confidenceLevel: responseIntelligence.aiConfidence?.label || "Low",
    confidenceExplanation: responseIntelligence.aiConfidence?.explanation || null,
    underservedMarketDetection: responseIntelligence.underservedMarketDetection,
    comparativeSimulations: responseIntelligence.comparativeSimulations,
    opportunityCards: responseIntelligence.opportunityCards,
    riskSummaries: responseIntelligence.riskSummaries,
    districtComparison: responseIntelligence.districtComparison,
    pricingSummary: responseIntelligence.pricingSummary,
    saturationIndicators: responseIntelligence.saturationIndicators,
    marketGapEngine: responseIntelligence.marketGapEngine,
    boiScore: responseIntelligence.boiScore,
    strategicAdvisor: responseIntelligence.strategicAdvisor,
    provider,
    model: provider.startsWith("gemini-") || provider === "hybrid-gemini-grounded" ? geminiModel : "local-analysis-rules",
    responseLanguage,
    architecture: "intent-router + analytics-evidence-pack + deterministic-consultant-engine + optional-llm-synthesis",
    dataSources: {
      analytics: persistedAnalysis?.chatSource || (activeAnalysis ? "request-analysis-payload" : "none"),
      memory: history.length ? "persisted-chat-history" : "current-conversation-only",
      scoring: analyticsContext.state === "analysis_loaded" ? "platform-scoring-engine" : "unavailable"
    },
    conversationMemory: {
      summary: orchestration.previousChatMemory?.memorySummary || null,
      extractedEntities: orchestration.previousChatMemory?.extractedEntities || null,
      resolvedContext: orchestration.userContext?.resolvedConversationContext || null,
      rule: orchestration.previousChatMemory?.rule || "Memory cannot create analytics evidence."
    },
    orchestration: orchestration.manifest,
    analyticsContext: analyticsContext.state === "analysis_loaded" ? analyticsContext : { state: analyticsContext.state, missing: analyticsContext.missing },
    intent: consultantBrief.intent,
    evidencePack: consultantBrief.evidencePack,
    generatedAt: new Date().toISOString()
  };
}

async function streamChatReply({ res, messages, analysis, user, language, analysisId, requestContext = null }) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  try {
    const result = await createChatReply({ messages, analysis, user, language, analysisId, requestContext });
    const chunks = splitIntoChunks(result.reply);

    for (const chunk of chunks) {
      if (res.destroyed) {
        break;
      }

      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      await delay(18);
    }

    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ done: true, meta: result })}\n\n`);
    }
  } catch (error) {
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ error: error.message || "Chat failed" })}\n\n`);
    }
  } finally {
    if (!res.destroyed) {
      res.end();
    }
  }
}

async function loadPersistedAnalysisForChat({ user, analysisId, useLatestWhenMissing = false }) {
  if (!user?.id) {
    return null;
  }

  try {
    if (analysisId) {
      const analysis = await getAnalysisById({ id: analysisId, userId: user.id });
      return analysis ? { ...analysis, chatSource: "saved_analysis_by_id" } : null;
    }

    if (useLatestWhenMissing) {
      const analyses = await listAnalyses({ userId: user.id, limit: 1 });
      return analyses[0] ? { ...analyses[0], chatSource: "latest_saved_analysis" } : null;
    }

    return null;
  } catch {
    return null;
  }
}

async function requestGeminiReply({ conversation, analysis, analyticsContext, language, consultantBrief, orchestration, requestContext }) {
  const modelsToTry = Array.from(new Set([geminiModel, ...geminiFallbackModels]));
  const errors = [];

  for (const model of modelsToTry) {
    try {
      return await requestGeminiReplyWithModel({ model, conversation, analysis, analyticsContext, language, consultantBrief, orchestration, requestContext });
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function requestGeminiReplyWithModel({ model, conversation, analysis, analyticsContext, language, consultantBrief, orchestration, requestContext }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let response;
  const latestQuestion = [...normalizeMessages(conversation)].reverse().find((message) => message.role === "user")?.content || "";
  const questionFocus = inferQuestionFocus(latestQuestion);
  const mode = consultantBrief?.mode || "business_analytics";
  const generalConversation = mode === "general_conversation";
  const directoryDiscovery = mode === "directory_discovery";
  const directoryContext = requestContext?.discoveryContext || null;
  const currentConversation = directoryDiscovery
    ? normalizeMessages(conversation).slice(-8).map((message) => ({ ...message, content: message.content.slice(0, 1400) }))
    : conversation;
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const url = `${geminiUrl.replace(/\/$/, "")}/${modelPath}:generateContent`;

  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": geminiApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildConsultantSystemPrompt(language, mode) }]
        },
        generationConfig: { maxOutputTokens: directoryDiscovery ? 768 : 4096 },
        contents: [
          geminiUserContent(generalConversation
            ? `Latest user message: ${latestQuestion}\nAnswer it directly as ordinary conversation.`
            : `Latest user question: ${latestQuestion}\nQuestion focus: ${questionFocus}`),
          ...(directoryDiscovery ? [geminiUserContent(`Current TezTap section context JSON:\n${JSON.stringify(directoryContext)}`)] : []),
          ...(generalConversation ? [] : [
            ...(directoryDiscovery ? [] : [geminiUserContent(analysis
              ? `Grounded TezTap analytics context JSON:\n${JSON.stringify(buildGeminiGroundedContext({ analysis, analyticsContext, consultantBrief, orchestration }), null, 2)}`
              : "No business analysis is loaded yet. Do not invent platform metrics; ask the user to run an analysis for data-backed business questions.")])
          ]),
          geminiUserContent(directoryDiscovery
            ? `TezTap directory task: answer the latest question about the active page. Compare only the records supplied above. Explain provided scores and factors as-is. Distinguish demo records from verified 2GIS records. Do not claim that a local draft or request was sent to a provider.`
            : buildGeminiControlPrompt({ consultantBrief, latestQuestion, questionFocus, analysis })),
          ...toGeminiConversation(directoryDiscovery ? currentConversation.slice(0, -1) : currentConversation)
        ]
      })
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Gemini request failed: ${response.status} ${details.slice(0, 180)}`);
  }

  const data = await response.json();
  const content = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!content) {
    throw new Error("Gemini returned an empty answer");
  }

  return content;
}

function cleanGeminiReply(reply, mode) {
  const text = String(reply || "").trim();

  if (mode === "general_conversation") {
    return text;
  }

  return text
    .replace(/^\s*(Verdict|Evidence|Implication|Recommended action|Strategic Assessment|Business Opportunity Index)\s*:\s*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildGeminiGroundedContext({ analysis, analyticsContext, consultantBrief, orchestration }) {
  const topDistricts = (analysis?.districtMetrics || analysis?.opportunityAreas || []).slice(0, 6);
  const scores = analysis?.proprietaryScoring?.scores || {};
  const riskAnalysis = analysis?.analyticsEngine?.riskAnalysis || {};

  return {
    rule: "Use only this calculated platform data. Do not invent missing metrics.",
    loadedAnalysisState: analysis ? "analysis_loaded" : "no_analysis",
    input: analysis?.input || null,
    profile: analysis?.profile || null,
    mainScores: {
      successProbability: scores.successProbability ?? analysis?.probability?.successProbability ?? null,
      opportunityScore: scores.opportunityScore ?? analysis?.opportunityScore?.score ?? null,
      riskScore: scores.riskScore ?? riskAnalysis.riskScore ?? null,
      investmentAttractiveness: scores.investmentAttractiveness ?? null,
      saturation: analysis?.opportunityScore?.saturation ?? null
    },
    budget: {
      inputBudget: analysis?.budgetPlan?.inputBudget ?? analysis?.input?.budget ?? null,
      minimumViableBudget: analysis?.budgetPlan?.minimumViableBudget ?? analysis?.profile?.minimumViableBudget ?? null,
      budgetRealismScore: analysis?.budgetPlan?.budgetRealismScore ?? null,
      budgetRiskLevel: analysis?.budgetPlan?.budgetRiskLevel ?? null,
      isBelowMinimum: analysis?.budgetPlan?.isBelowMinimum ?? null,
      budgetShortfall: analysis?.budgetPlan?.budgetShortfall ?? null
    },
    recommendation: {
      bestArea: analysis?.recommendation?.bestArea || analysis?.opportunityScore?.bestDistrict || null,
      explanation: analysis?.recommendation?.explanation || null,
      pricingStrategy: analysis?.recommendation?.pricingStrategy || null,
      nextActions: analysis?.recommendation?.nextActions || []
    },
    market: {
      competitorCount: analysis?.market?.competitorCount ?? null,
      density: analysis?.market?.density ?? null,
      priceSampleCount: analysis?.stats?.sampleCount ?? null,
      averagePrice: analysis?.stats?.avgPrice ?? null,
      sources: analysis?.sources || null
    },
    sourceEvidence: {
      businessSource: analysis?.sources?.businesses || null,
      priceSource: analysis?.sources?.prices || null,
      dataVersion: analysis?.meta?.dataVersion || null,
      generatedAt: analysis?.meta?.generatedAt || null
    },
    districts: topDistricts.map((district) => ({
      district: district.district || district.name,
      opportunityScore: district.opportunityScore ?? district.score ?? null,
      nearbyCompetitors: district.nearbyCompetitors ?? district.competitorCountNearby ?? null,
      saturation: district.saturation ?? null,
      footTraffic: district.footTraffic ?? null,
      underservedScore: district.underservedScore ?? null,
      investmentAttractiveness: district.investmentAttractiveness ?? null,
      why: district.why || district.explanation || null
    })),
    districtRankings: analyticsContext?.districtRankings || [],
    saturationAnalysis: analyticsContext?.saturationAnalysis || analysis?.saturationData || null,
    pricingIntelligence: analyticsContext?.pricingIntelligence || analysis?.pricingIntelligence || null,
    competitorRatings: analyticsContext?.competitorRatings || null,
    reviewSentiment: analyticsContext?.reviewSentiment || null,
    heatmapData: analyticsContext?.heatmapData || analysis?.market?.map || null,
    trafficEstimation: analyticsContext?.trafficEstimation || null,
    swotAnalysis: analyticsContext?.swotAnalysis || analysis?.strategicIntelligence?.swot || null,
    financialForecasts: analyticsContext?.financialForecasts || null,
    profitabilityProjections: analyticsContext?.profitabilityProjections || analysis?.charts?.profitabilityProjection || [],
    businessCategoryStats: analysis?.businessCategoryStats || [],
    analyticsEngine: analysis?.analyticsEngine || null,
    proprietaryScoring: analysis?.proprietaryScoring || null,
    plannedBusinesses: analysis?.plannedBusinesses || [],
    projectedMarket: analysis?.projectedMarket || null,
    opportunityDiscovery: analysis?.opportunityDiscovery || null,
    investmentModule: analysis?.investmentModule || null,
    cityEconomicIndicator: analysis?.cityEconomicIndicator || null,
    ecosystemWorkflows: analysis?.ecosystemWorkflows || null,
    topCompetitors: (analysis?.competitors || []).slice(0, 12).map((competitor) => ({
      name: competitor.name,
      district: competitor.area,
      address: competitor.address,
      rating: competitor.rating,
      ratingsCount: competitor.ratingsCount,
      category: competitor.category,
      source: competitor.source
    })),
    priceRecords: (analysis?.prices || []).slice(0, 18),
    risks: (riskAnalysis.risks || []).slice(0, 5),
    marketGaps: (analysis?.marketGapEngine?.signals || analysis?.opportunityDiscovery?.marketGaps || []).slice(0, 8),
    budgetAlternatives: analysis?.proprietaryScoring?.budgetIntelligence?.alternativeRecommendations || [],
    intent: consultantBrief?.intent || null,
    evidencePack: consultantBrief?.evidencePack || null,
    memoryRule: orchestration?.previousChatMemory?.rule || null
  };
}

function buildGeminiControlPrompt({ consultantBrief, latestQuestion, questionFocus, analysis }) {
  const generalConversation = consultantBrief?.mode === "general_conversation";

  if (generalConversation) {
    return `General conversation instruction:\nAnswer only this message naturally and concisely: ${latestQuestion}`;
  }

  const pricingSamples = Number(analysis?.stats?.sampleCount ?? 0);
  const requiredOpening = questionFocus === "pricing"
    ? pricingSamples > 0
      ? "Start with the recommended pricing corridor using only supplied price statistics."
      : "Start by saying no confident launch price can be recommended because verified price samples are 0. Then explain pricing risks and what evidence to collect."
    : questionFocus === "district"
      ? "Start with the best district name and why it ranks highest."
      : questionFocus === "risk"
        ? "Start with the highest risk factors and their metric values."
        : "Start with a direct answer to the user's exact question.";

  return `Gemini consultant instruction JSON:\n${JSON.stringify({
    architecture: "analytics-engine + compact-grounded-context + gemini-strategic-synthesis",
    mode: consultantBrief?.mode || "business_analytics",
    latestQuestion,
    questionFocus,
    requiredOpening: generalConversation ? "Answer naturally without an analytics opening." : requiredOpening,
    rule: generalConversation
      ? "Answer the latest question as a normal conversational AI. Do not mention the platform or analytics and do not add unrelated business advice."
      : "Answer the user's latest question directly and specifically. Follow requiredOpening before discussing any other topic. Do not start every answer with the same general business verdict. Use supplied metrics as evidence, but do not copy or imitate any deterministic draft. Do not invent absent metrics.",
    intent: consultantBrief?.intent || "executive_summary",
    routingRules: {
      pricing: "If the question asks about price or pricing strategy, start with the pricing answer. If price samples are 0, say no confident launch price can be recommended and explain what evidence is missing.",
      district: "If the question asks which district is best, start with the top district and cite district score, competitors, saturation, foot traffic, and underserved score.",
      risk: "If the question asks risks, start with the highest risks and cite exact risk metrics.",
      category: "If the question asks what business to open, compare supplied realistic categories and budget alternatives."
    },
    answerShape: generalConversation
      ? ["Direct, natural answer to the exact question"]
      : [
          "Answer the exact question in 1-3 concise paragraphs",
          "Mention only the calculated metrics needed to explain the answer",
          "Add one short caveat only when the data is incomplete"
        ],
    forbiddenFormat: generalConversation
      ? []
      : ["Verdict:", "Evidence:", "Implication:", "Recommended action:", "Strategic Assessment:", "Business Opportunity Index:"]
  }, null, 2)}`;
}

function inferQuestionFocus(question = "") {
  const text = String(question).toLowerCase();

  if (/(цена|цену|ценовой|прайс|стоимост|price|pricing|баға|бағаны)/i.test(text)) {
    return "pricing";
  }

  if (/(район|локац|место|district|location|where|аудан|орын)/i.test(text)) {
    return "district";
  }

  if (/(риск|угроз|опас|risk|threat|тәуекел)/i.test(text)) {
    return "risk";
  }

  if (/(какой бизнес|что открыть|business should|category|санат|бизнес)/i.test(text)) {
    return "category";
  }

  return "strategy";
}

function enforceQuestionSpecificGuardrails({ reply, question, analysis, language }) {
  const focus = inferQuestionFocus(question);
  const priceSamples = Number(analysis?.stats?.sampleCount ?? 0);

  if (focus !== "pricing" || priceSamples > 0) {
    return reply;
  }

  const prefix = language === "ru"
    ? "Прямой ответ: сейчас нельзя честно рекомендовать стартовую цену, потому что в текущем анализе 0 проверенных ценовых образцов. TezTap не должен придумывать прайс без подтвержденных меню, чеков или прайс-листов конкурентов.\n\n"
    : language === "kk"
      ? "Тікелей жауап: қазір бастапқы бағаны сенімді ұсынуға болмайды, өйткені ағымдағы талдауда 0 тексерілген баға үлгісі бар. TezTap расталған мәзірлерсіз, чектерсіз немесе бәсекелес прайс-парақтарынсыз баға ойлап таппауы керек.\n\n"
      : "Direct answer: TezTap cannot honestly recommend a launch price yet because the current analysis contains 0 verified price samples. The platform should not invent pricing without confirmed menus, receipts, or competitor price lists.\n\n";

  if (String(reply || "").toLowerCase().includes("0 проверенных ценовых") || String(reply || "").toLowerCase().includes("0 verified price")) {
    return `${prefix}${reply}`;
  }

  return `${prefix}${reply}`;
}

function geminiUserContent(text) {
  return {
    role: "user",
    parts: [{ text: String(text || "") }]
  };
}

function toGeminiConversation(conversation = []) {
  return normalizeMessages(conversation).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
}

function buildSystemPrompt(language) {
  return [
    "You are TezTap Strategic Analyst, a premium AI business consultant embedded in a geoanalytics SaaS platform.",
    "Act like a senior market intelligence consultant, startup advisor, and investor-readiness analyst.",
    "Your job is to interpret the platform's calculated analytics, not to invent a separate opinion.",
    "Use only supplied structured analytics data, scoring-engine fields, strategic modules, risks, district metrics, map and competition density, saturation data, pricing intelligence, business category statistics, probability scores, source metadata, competitor rows, price records, and formulas.",
    "The AI Orchestration Layer supplies analytics outputs, district metrics, business intelligence, user context, and previous chat memory. Use it to resolve intent and continuity, but never override calculated analytics with memory or preference.",
    "Never create probability scores, district scores, prices, competitors, ratings, addresses, sources, business categories, timelines, or recommendations that are not present in the supplied metrics.",
    "Do not use generic startup advice unless it is directly tied to a supplied metric.",
    "When answering, prefer an executive consultant format: verdict, evidence, implication, recommended action.",
    "Cite exact values by metric name whenever possible.",
    "If budgetPlan.isBelowMinimum is true, clearly state that the submitted budget is not realistic, cite budgetShortfall, minimumViableBudget, budgetRealismScore, and budgetRiskLevel, and do not soften the warning with optimistic language.",
    "Treat budget realism as a primary driver of success probability, business viability, investment attractiveness, and risk level.",
    "When you recommend a district or category, cite the exact metric names and values that justify it.",
    "If evidence is weak or missing, say exactly which evidence is missing and what should be collected next.",
    "Always expose AI confidence as High, Medium, or Low and explain it using data availability, market clarity, and analytics completeness.",
    "When underserved market detections are supplied, use them as hypotheses grounded in market-gap, district, category, and pricing metrics.",
    "When comparative simulations are supplied, explain before-versus-after probability changes using the simulation risk deltas instead of inventing new percentages.",
    "When BOI or market gap engine outputs are supplied, treat them as proprietary calculated platform metrics and explain all recommendations through their drivers.",
    "Challenge weak ideas, suggest pivots, and recommend alternatives only when the supplied analytics support the challenge.",
    "If the data does not support an answer, say that directly and ask for the missing analysis input or evidence.",
    "A deterministic local analytics engine will provide an intent, evidence pack, and grounded consultant draft. Treat that draft as the primary scaffold; refine wording only if you preserve the same evidence and do not add unsupported claims.",
    "Keep responses concise but boardroom-ready. Avoid casual chatbot tone.",
    `Answer in ${languageName(language)}.`
  ].join(" ");
}

function buildMarketContext(analysis) {
  if (!analysis) {
    return "No market analysis is loaded yet. Ask the user to run an analysis first.";
  }

  const compact = {
    input: analysis.input,
    profile: analysis.profile,
    structuredAnalyticsData: {
      stats: analysis.stats,
      analytics: analysis.analytics,
      analyticsEngine: analysis.analyticsEngine,
      marketGapEngine: analysis.marketGapEngine,
      proprietaryScoring: analysis.proprietaryScoring,
      opportunityDiscovery: analysis.opportunityDiscovery,
      budgetPlan: analysis.budgetPlan,
      opportunityScore: analysis.opportunityScore,
      recommendation: analysis.recommendation,
      sources: analysis.sources
    },
    districtMetrics: (analysis.districtMetrics || analysis.opportunityAreas || []).slice(0, 8),
    competitionDensity: {
      competitorCount: analysis.market?.competitorCount,
      overallDensity: analysis.market?.density,
      areaCounts: analysis.market?.areaCounts,
      densityByArea: analysis.market?.densityByArea
    },
    saturationData: analysis.saturationData || {
      overall: analysis.opportunityScore?.saturation,
      districts: (analysis.opportunityAreas || []).map((area) => ({
        district: area.name,
        saturation: area.saturation,
        nearbyCompetitors: area.competitorCountNearby
      }))
    },
    pricingIntelligence: analysis.pricingIntelligence || {
      sampleCount: analysis.stats?.sampleCount,
      averagePrice: analysis.stats?.avgPrice,
      minPrice: analysis.stats?.minPrice,
      maxPrice: analysis.stats?.maxPrice,
      suggestedPrice: analysis.recommendation?.suggestedPrice,
      pricePosition: analysis.recommendation?.pricePosition
    },
    businessCategoryStatistics: analysis.businessCategoryStats || [],
    strategicIntelligence: analysis.strategicIntelligence || {},
    underservedMarketDetection: analysis.underservedMarketDetection || [],
    comparativeSimulations: analysis.comparativeSimulations || [],
    marketGapEngine: analysis.marketGapEngine || {},
    growthInsights: analysis.growthInsights || [],
    investorDecision: analysis.investorDecision || {},
    financialForecasts: {
      budgetPlan: analysis.budgetPlan,
      scenarios: analysis.investorDecision?.scenarios || [],
      boardMetrics: analysis.investorDecision?.boardMetrics || [],
      profitabilityProjection: (analysis.charts?.profitabilityProjection || []).slice(0, 12)
    },
    probabilityScores: analysis.probabilityScores || {
      success: analysis.probability?.successProbability,
      profitability: analysis.probability?.profitabilityProbability,
      survival: analysis.probability?.survivalProbability,
      level: analysis.probability?.level,
      assumptions: analysis.probability?.assumptions,
      formulas: analysis.probability?.formulas
    },
    topCompetitors: (analysis.competitors || []).slice(0, 14).map((competitor) => ({
      name: competitor.name,
      area: competitor.area,
      address: competitor.address,
      rating: competitor.rating,
      ratingsCount: competitor.ratingsCount,
      category: competitor.category,
      priceSamples: (competitor.priceSamples || []).slice(0, 4)
    })),
    priceRecords: (analysis.prices || []).slice(0, 18),
    formulas: analysis.probability?.formulas
  };

  return `Current market context JSON:\n${JSON.stringify(compact, null, 2)}`;
}

function buildAiOrchestrationLayer({ analysis, analyticsContext, aiConfidence, underservedMarketDetection, comparativeSimulations, user, analysisId, language, history, memoryContext, requestContext, messages, conversation, latestUserMessage }) {
  const recentHistory = normalizeMessages(history || []).slice(-8);
  const incomingMessages = normalizeMessages(messages || []).slice(-8);
  const currentInput = analysis?.input || null;
  const districtRows = analysis?.districtMetrics || analysis?.opportunityAreas || [];
  const strategic = analysis?.strategicIntelligence || {};
  const analyticsEngine = analysis?.analyticsEngine || null;

  const orchestration = {
    layer: "TezTap AI Orchestration Layer",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    purpose: "Collect and route platform intelligence into grounded AI consultant answers.",
    guardrails: [
      "Use real platform analytics only.",
      "Do not invent metrics, districts, prices, competitors, probabilities, forecasts, or sources.",
      "Previous chat memory may preserve user intent, but it cannot create analytics evidence.",
      "If analytics are missing, ask for an analysis run instead of guessing."
    ],
    userContext: {
      authenticated: Boolean(user?.id),
      userId: user?.id || null,
      name: user?.name || null,
      company: user?.company || null,
      language,
      analysisId,
      requestContext,
      latestQuestion: latestUserMessage?.content || null,
      resolvedConversationContext: resolveConversationContext({ analysis, memoryContext, requestContext, latestUserMessage }),
      activeAnalysisInput: currentInput
    },
    previousChatMemory: {
      persistedMessages: recentHistory,
      incomingMessages,
      conversationWindow: conversation,
      memorySummary: memoryContext?.summary || summarizeChatMemory(recentHistory),
      recentUserQuestions: memoryContext?.recentUserQuestions || [],
      extractedEntities: memoryContext?.entities || null,
      rule: memoryContext?.rule || "Memory cannot create analytics evidence."
    },
    analyticsOutputs: {
      dedicatedAnalyticsContext: analyticsContext || null,
      realtimeAnalytics: analysis?.analytics || null,
      premiumAnalyticsEngine: analyticsEngine,
      marketGapEngine: analysis?.marketGapEngine || null,
      proprietaryScoring: analysis?.proprietaryScoring || null,
      opportunityDiscovery: analysis?.opportunityDiscovery || null,
      opportunityScore: analysis?.opportunityScore || null,
      probability: analysis?.probability || null,
      probabilityScores: analysis?.probabilityScores || null,
      budgetPlan: analysis?.budgetPlan || null,
      charts: {
        profitabilityProjection: (analysis?.charts?.profitabilityProjection || []).slice(0, 12),
        districtComparison: (analysis?.charts?.districtComparison || []).slice(0, 12),
        marketSaturation: (analysis?.charts?.marketSaturation || []).slice(0, 12)
      }
    },
    districtMetrics: {
      rankings: districtRows.slice(0, 8),
      saturationData: analysis?.saturationData || null,
      mapModel: analysis?.market?.map || null,
      competitionDensity: analyticsEngine?.competitionDensity || {
        overall: analysis?.market?.density || null,
        competitorCount: analysis?.market?.competitorCount || 0,
        densityByArea: analysis?.market?.densityByArea || []
      }
    },
    businessIntelligence: {
      recommendation: analysis?.recommendation || null,
      pricingIntelligence: analysis?.pricingIntelligence || null,
      categoryStats: analysis?.businessCategoryStats || [],
      swot: strategic.swot || null,
      riskAnalysis: strategic.riskAnalysis || [],
      aiConfidence: aiConfidence || null,
      underservedMarketDetection: underservedMarketDetection || [],
      comparativeSimulations: comparativeSimulations || [],
      proprietaryScoring: analysis?.proprietaryScoring || null,
      marketGapEngine: analysis?.marketGapEngine || null,
      opportunityDiscovery: analysis?.opportunityDiscovery || null,
      marketGapDetection: strategic.marketGapDetection || [],
      growthInsights: analysis?.growthInsights || [],
      investorDecision: analysis?.investorDecision || null,
      financialEstimates: analyticsEngine?.financialEstimates || null
    }
  };

  return {
    ...orchestration,
    manifest: buildOrchestrationManifest(orchestration)
  };
}

function buildOrchestrationManifest(orchestration) {
  return {
    layer: orchestration.layer,
    version: orchestration.version,
    collected: {
      analyticsOutputs: Boolean(orchestration.analyticsOutputs.realtimeAnalytics || orchestration.analyticsOutputs.premiumAnalyticsEngine),
      districtMetrics: Boolean(orchestration.districtMetrics.rankings?.length),
      businessIntelligence: Boolean(orchestration.businessIntelligence.recommendation || orchestration.businessIntelligence.swot),
      userContext: Boolean(orchestration.userContext),
      previousChatMemory: Boolean(orchestration.previousChatMemory.persistedMessages?.length || orchestration.previousChatMemory.incomingMessages?.length)
    },
    counts: {
      districtRows: orchestration.districtMetrics.rankings?.length || 0,
      persistedMemoryMessages: orchestration.previousChatMemory.persistedMessages?.length || 0,
      incomingMessages: orchestration.previousChatMemory.incomingMessages?.length || 0,
      riskItems: orchestration.businessIntelligence.riskAnalysis?.length || 0,
      marketGaps: orchestration.businessIntelligence.marketGapDetection?.length || 0,
      growthInsights: orchestration.businessIntelligence.growthInsights?.length || 0
    },
    activeAnalysisInput: orchestration.userContext.activeAnalysisInput,
    latestQuestion: orchestration.userContext.latestQuestion
  };
}

function resolveConversationContext({ analysis, memoryContext, requestContext, latestUserMessage }) {
  const entities = memoryContext?.entities || {};
  const latestQuestion = String(latestUserMessage?.content || "");
  const mentionedBudget = extractBudgetFromText(latestQuestion) || entities.latestBudget || null;

  return {
    city: requestContext?.userContext?.city || requestContext?.analysisInput?.city || analysis?.input?.city || null,
    businessType: requestContext?.businessType || entities.latestBusinessFocus || analysis?.input?.businessType || null,
    budget: mentionedBudget || requestContext?.budget || analysis?.input?.budget || null,
    previousBudget: analysis?.input?.budget || null,
    selectedDistrict: requestContext?.selectedDistrict || entities.latestDistrictFocus || analysis?.recommendation?.bestArea || null,
    isFollowUp: Boolean(entities.hasFollowUpSignal || /\b(what if|instead|same|that|there|it)\b/i.test(latestQuestion)),
    rule: "Resolved context is used to understand follow-up questions; metrics still come only from the loaded analytics."
  };
}

function extractBudgetFromText(text) {
  const match = String(text || "").match(/(\d+(?:[.,]\d+)?)\s*(million|m|mln|k)?\s*(kzt|\u20b8|tenge)?/i);

  if (!match) {
    return null;
  }

  const raw = Number(String(match[1]).replace(",", "."));
  const suffix = String(match[2] || "").toLowerCase();

  if (!Number.isFinite(raw)) {
    return null;
  }

  if (suffix === "million" || suffix === "m" || suffix === "mln") {
    return Math.round(raw * 1000000);
  }

  if (suffix === "k") {
    return Math.round(raw * 1000);
  }

  return raw >= 100000 ? Math.round(raw) : null;
}

function summarizeChatMemory(messages) {
  if (!messages.length) {
    return "No persisted chat memory is available for this user.";
  }

  const recentUserQuestions = messages
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => message.content);

  return recentUserQuestions.length
    ? `Recent user questions: ${recentUserQuestions.join(" | ")}`
    : "Persisted assistant messages exist, but no recent user questions were found.";
}

function buildOrchestrationContext(orchestration) {
  return `AI orchestration layer JSON:\n${JSON.stringify({
    manifest: orchestration.manifest,
    userContext: orchestration.userContext,
    previousChatMemory: orchestration.previousChatMemory,
    analyticsOutputs: orchestration.analyticsOutputs,
    districtMetrics: orchestration.districtMetrics,
    businessIntelligence: orchestration.businessIntelligence,
    guardrails: orchestration.guardrails
  }, null, 2)}`;
}

function buildHybridConsultantBrief({ question, analysis, language, orchestration, analyticsContext, mode = "business_analytics" }) {
  const intent = classifyConsultantIntentFromModule(question);
  const evidencePack = {
    ...buildRecommendationEvidence({ analysis, analyticsContext, intent, orchestration }),
    consultantRead: buildConsultantEvidencePack({ analysis, intent, orchestration })
  };
  return {
    mode,
    intent,
    evidencePack
  };
}

function classifyConversationMode(question, conversation = [], hasAnalysis = false) {
  const text = String(question || "").toLowerCase();
  const trimmed = text.trim();

  if (isClearlyGeneralConversation(trimmed)) {
    return "general_conversation";
  }

  const businessSignals = [
    "business", "market", "competitor", "competition", "district", "location", "investment", "investor",
    "pricing", "price strategy", "profit", "profitability", "revenue", "forecast", "saturation", "opportunity score",
    "risk", "swot", "roi", "budget", "demand", "category", "open a", "launch", "franchise", "coffee shop",
    "бизнес", "рынок", "конкурент", "конкуренц", "район", "локац", "инвестиц", "цена", "прибыл", "прогноз",
    "насыщен", "возможност", "риск", "бюджет", "спрос", "категор", "открыть", "кофейн", "окупаем",
    "бизнес", "нарық", "бәсек", "аудан", "орын", "инвести", "баға", "пайда", "тәуекел", "бюджет", "сұраныс"
  ];

  if (businessSignals.some((signal) => text.includes(signal))) {
    return "business_analytics";
  }

  const isContextualFollowUp = /^(and|what about|what if|how about|why|explain|compare|а если|а что насчёт|а как насчёт|а почему|почему|объясни|сравни|что думаешь|а это|по нему|про него|про этот|ал|егер|ал егер|неге|түсіндір|салыстыр)/i.test(trimmed);
  const previousText = conversation
    .slice(0, -1)
    .map((message) => String(message?.content || "").toLowerCase())
    .join(" ");

  if (isContextualFollowUp && (hasAnalysis || businessSignals.some((signal) => previousText.includes(signal)))) {
    return "business_analytics";
  }

  return hasAnalysis ? "business_analytics" : "general_conversation";
}

function isClearlyGeneralConversation(text) {
  if (!text) {
    return true;
  }

  if (/^(hello|hi|hey|привет|здравствуй|здравствуйте|сәлем|салем|қайырлы)\b/i.test(text)) {
    return true;
  }

  if (/(what is ai|что такое ии|что такое ai|что такое искусственный интеллект|инфляц|inflation|расскажи шут|tell me a joke|анекдот|шутк|әзіл)/i.test(text)) {
    return true;
  }

  return false;
}

function buildGeneralFallbackReply(question, language = "en") {
  const text = String(question || "").trim().toLowerCase();

  if (!text) {
    return language === "ru" ? "Чем я могу помочь?" : language === "kk" ? "Қалай көмектесе аламын?" : "How can I help?";
  }

  if (/^(hello|hi|hey|привет|здравствуй|сәлем)/i.test(text)) {
    return language === "ru" ? "Здравствуйте. Чем могу помочь?" : language === "kk" ? "Сәлеметсіз бе. Қалай көмектесе аламын?" : "Hello. How can I help?";
  }

  if (text.includes("joke") || text.includes("шутк") || text.includes("әзіл")) {
    return language === "ru" ? "Почему аналитик не спорит с данными? Потому что у них всегда есть последняя цифра." : language === "kk" ? "Аналитик деректермен неге дауласпайды? Өйткені соңғы сөз әрқашан сандарда." : "Why did the analyst trust the data? Because it always had the last word.";
  }

  return language === "ru"
    ? "Я понял вопрос, но сейчас не могу получить ответ от Gemini. Уточните, пожалуйста, что именно вы хотите узнать."
    : language === "kk"
      ? "Сұрағыңызды түсіндім, бірақ қазір Gemini-ден жауап ала алмадым. Нақты нені білгіңіз келетінін нақтылаңыз."
      : "I understood your question, but Gemini is temporarily unavailable. Could you clarify what you would like to know?";
}

function buildDirectGeneralReply(question, language = "en") {
  const text = String(question || "").trim().toLowerCase();

  if (/^(hello|hi|hey|привет|здравствуй|здравствуйте|сәлем|салем|қайырлы)/i.test(text)) {
    return language === "ru"
      ? "Привет! Чем могу помочь?"
      : language === "kk"
        ? "Сәлем! Қалай көмектесе аламын?"
        : "Hello! How can I help?";
  }

  return null;
}

function detectMessageLanguage(message) {
  const text = String(message || "").trim().toLowerCase();

  if (!text) {
    return null;
  }

  const kazakhSignals = /[әғқңөұүһі]|(\b(сәлем|салем|қалай|қайда|неге|қанша|қандай|осы|мына|аудан|бизнес|баға|тәуекел|мүмкіндік|сұраныс|нарық|пайда|дүкен)\b)/i;
  if (kazakhSignals.test(text)) {
    return "kk";
  }

  if (/[а-яё]/i.test(text)) {
    return "ru";
  }

  return null;
}

function buildGeminiUnavailableReply(language = "en") {
  if (language === "ru") {
    return "Gemini сейчас недоступен. Проверьте GEMINI_API_KEY и подключение к API.";
  }

  if (language === "kk") {
    return "Gemini қазір қолжетімсіз. GEMINI_API_KEY және API қосылымын тексеріңіз.";
  }

  return "Gemini is unavailable right now. Check GEMINI_API_KEY and the API connection.";
}

function classifyConsultantIntent(question) {
  const lower = String(question || "").toLowerCase();

  if (matches(lower, ["what business", "which business", "business should", "should i open", "what should i open", "business idea", "business ideas", "open in", "category to open"])) {
    return "business_recommendation";
  }

  if (matches(lower, ["challenge", "pressure test", "pressure-test", "weak idea", "bad idea", "pivot", "alternative", "alternatives", "compare business", "compare plans", "lower risk"])) {
    return "strategic_advisor";
  }

  if (matches(lower, ["simulation", "simulate", "before", "after", "optimization", "optimisation", "improve probability", "probability improved", "compare scenarios"])) {
    return "comparative_simulation";
  }

  if (matches(lower, ["boi", "business opportunity index", "opportunity index"])) {
    return "boi_explanation";
  }

  if (matches(lower, ["challenge", "weak idea", "bad idea", "pivot", "alternative", "alternatives", "compare business plans"])) {
    return "strategic_challenge";
  }

  if (matches(lower, ["district", "area", "location", "where"])) {
    return "district_strategy";
  }

  if (matches(lower, ["oversaturated", "saturated", "saturation", "too crowded", "crowded market"])) {
    return "saturation_analysis";
  }

  if (matches(lower, ["price", "pricing", "charge", "menu price", "price strategy"])) {
    return "pricing_strategy";
  }

  if (matches(lower, ["lowest competition", "least competition", "weak competition", "low competition", "competitor", "competition"])) {
    return "competition_analysis";
  }

  if (matches(lower, ["demand growing", "growth", "where is demand", "demand", "underserved", "market gap", "white space", "whitespace"])) {
    return "demand_growth";
  }

  if (matches(lower, ["budget increase", "budget increases", "increase my budget", "budget rises", "budget goes", "more budget", "20 million", "15 million"])) {
    return "budget_scenario";
  }

  if (matches(lower, ["forecast", "financial", "break-even", "breakeven", "runway", "profit", "revenue", "payback", "budget"])) {
    return "financial_forecast";
  }

  if (matches(lower, ["risk", "risks", "downside", "fragile", "threat"])) {
    return "risk_analysis";
  }

  if (matches(lower, ["probability", "success", "survival", "chance"])) {
    return "probability_explanation";
  }

  if (matches(lower, ["swot", "strength", "weakness", "opportunity"])) {
    return "swot_analysis";
  }

  return "executive_summary";
}

function buildConsultantEvidencePack({ analysis, intent, orchestration }) {
  if (!analysis) {
    return {
      state: "no_analysis",
      missing: ["city", "businessType", "budget", "backend analysis result"]
    };
  }

  const bestDistrict = getBestDistrict(analysis);
  const lowestCompetitionDistrict = getLowestCompetitionDistrict(analysis);
  const bestCategory = pickBestCategory(analysis);
  const lowestCompetitionCategory = pickLowestCompetitionCategory(analysis);
  const forecast = getFinancialForecast(analysis);
  const growth = getGrowthSignal(analysis);

  return {
    state: "analysis_loaded",
    intent,
    orchestrationManifest: orchestration?.manifest || null,
    userContext: orchestration?.userContext || null,
    previousChatMemory: orchestration?.previousChatMemory?.memorySummary || null,
    input: analysis.input,
    coreScores: {
      opportunityScore: analysis.opportunityScore?.score,
      opportunityLabel: analysis.opportunityScore?.label,
      successProbability: analysis.probability?.successProbability,
      profitabilityProbability: analysis.probability?.profitabilityProbability,
      survivalProbability: analysis.probability?.survivalProbability,
      probabilityLevel: analysis.probability?.level,
      dataConfidence: analysis.investorDecision?.dataRoom?.score ?? analysis.probability?.assumptions?.evidenceScore
    },
    boi: analysis.marketGapEngine?.boi || null,
    marketGapEngine: analysis.marketGapEngine || null,
    strategicAdvisor: analysis.marketGapEngine?.strategicAdvisor || null,
    marketMetrics: {
      competitorCount: analysis.market?.competitorCount,
      marketDensity: analysis.market?.density,
      priceSamples: analysis.stats?.sampleCount,
      averagePrice: analysis.stats?.avgPrice,
      saturation: analysis.opportunityScore?.saturation
    },
    premiumAnalyticsEngine: analysis.analyticsEngine,
    boiScore: analysis.marketGapEngine?.boi || null,
    aiConfidence: orchestration?.businessIntelligence?.aiConfidence || null,
    underservedMarketDetection: orchestration?.businessIntelligence?.underservedMarketDetection || analysis.underservedMarketDetection || [],
    comparativeSimulations: orchestration?.businessIntelligence?.comparativeSimulations || analysis.comparativeSimulations || [],
    districtIntelligence: {
      bestDistrict,
      lowestCompetitionDistrict,
      topDistricts: (analysis.districtMetrics || analysis.opportunityAreas || []).slice(0, 5)
    },
    pricingIntelligence: {
      suggestedPrice: analysis.recommendation?.suggestedPrice,
      pricePosition: analysis.recommendation?.pricePosition,
      pricingStrategy: analysis.recommendation?.pricingStrategy,
      priceRecords: (analysis.prices || []).slice(0, 8)
    },
    categoryIntelligence: {
      bestCategory,
      lowestCompetitionCategory,
      categories: (analysis.strategicIntelligence?.categoryIntelligence?.categories || analysis.businessCategoryStats || []).slice(0, 8)
    },
    saturationAnalysis: {
      overall: analysis.opportunityScore?.saturation,
      districts: analysis.saturationData?.districts || []
    },
    riskAndSwot: {
      risks: analysis.strategicIntelligence?.riskAnalysis || [],
      swot: analysis.strategicIntelligence?.swot || null
    },
    demandGrowth: growth,
    financialForecast: forecast,
    nextActions: analysis.recommendation?.nextActions || []
  };
}

function buildDeterministicReply({ question, analysis, language, error, orchestration }) {
  const t = { ...defaultDictionary(), ...dictionary(language) };

  if (!analysis) {
    return t.noAnalysis;
  }

  const lower = String(question || "").toLowerCase();
  const resolvedContext = orchestration?.userContext?.resolvedConversationContext || {};
  const bestArea = analysis.opportunityAreas?.[0];
  const priceRecords = analysis.prices || [];
  const topPrices = priceRecords
    .slice()
    .sort((left, right) => Number(right.price) - Number(left.price))
    .slice(0, 4)
    .map((record) => `${record.productName}: ${formatMoney(record.price)} KZT at ${record.businessName}`)
    .join("; ");

  const answerParts = [];

  if (error) {
    answerParts.push(t.providerFallback);
  }

  const businessMismatch = buildBusinessContextMismatchAnswer({ question, analysis, t, resolvedContext });
  if (businessMismatch) {
    answerParts.push(businessMismatch);
    answerParts.push(buildConfidenceLine({ orchestration, analysis }));
    return answerParts.join("\n\n");
  }

  const budgetScenario = buildBudgetScenarioAnswer({ question, analysis, t, resolvedContext });
  if (budgetScenario) {
    answerParts.push(budgetScenario);
    answerParts.push(buildConfidenceLine({ orchestration, analysis }));
    return answerParts.join("\n\n");
  }

  const comparativeSimulationAnswer = buildComparativeSimulationAnswer({ lower, t, orchestration });
  if (comparativeSimulationAnswer) {
    answerParts.push(comparativeSimulationAnswer);
    answerParts.push(buildConfidenceLine({ orchestration, analysis }));
    return answerParts.join("\n\n");
  }

  const strategicAdvisorAnswer = buildStrategicAdvisorAnswer({ lower, analysis, t, orchestration });
  if (strategicAdvisorAnswer) {
    answerParts.push(strategicAdvisorAnswer);
    answerParts.push(buildConfidenceLine({ orchestration, analysis }));
    return answerParts.join("\n\n");
  }

  const earlyAnswer = buildTargetedConsultantAnswer({ lower, analysis, t, topPrices });
  if (earlyAnswer) {
    answerParts.push(earlyAnswer);
    answerParts.push(buildConfidenceLine({ orchestration, analysis }));
    return answerParts.join("\n\n");
  }

  if (/where|district|area|location|район|где|орналас|аудан/.test(lower)) {
    answerParts.push(bestArea
      ? consultantAnswer({
          verdict: `${t.bestDistrict} ${bestArea.name}.`,
          evidence: bestArea.reason,
          implication: "The district recommendation is grounded in the current map and competition analytics.",
          action: `Validate lease options in ${bestArea.name} against nearby competitor density and budget realism.`
        }, t)
      : t.noRankedDistrict);
  } else if (/price|pricing|стоим|цена|баға|price/.test(lower)) {
    answerParts.push(
      analysis.recommendation.suggestedPrice > 0
        ? consultantAnswer({
            verdict: `${t.priceAdvice} ${formatMoney(analysis.recommendation.suggestedPrice)} KZT.`,
            evidence: analysis.recommendation.pricingStrategy,
            implication: `Pricing posture: ${analysis.recommendation.pricePosition || "not specified by the analysis"}.`,
            action: "Validate the final launch price with comparable menu, catalog, or receipt samples."
          }, t)
        : t.noPrices
    );

    if (topPrices) {
      answerParts.push(`${t.evidence} ${t.visiblePrices} ${topPrices}.`);
    }
  } else if (/profit|probability|success|survival|прибыл|вероят|табыс|ықтимал/.test(lower)) {
    answerParts.push(
      consultantAnswer({
        verdict: `${t.probability} ${analysis.probability.successProbability}% (${analysis.probability.level}).`,
        evidence: `Profitability probability ${analysis.probability.profitabilityProbability}%; survival probability ${analysis.probability.survivalProbability}%. ${analysis.probability.explanation}`,
        implication: "Read the probability score together with budget realism, competition density, and evidence quality.",
        action: "Use the probability formulas to identify the weakest assumption before presenting to investors."
      }, t)
    );
  } else if (/swot|strength|weakness|opportunit|threat/.test(lower)) {
    const swot = analysis.strategicIntelligence?.swot;
    answerParts.push(
      swot
        ? consultantAnswer({
            verdict: "Investor-ready SWOT from calculated market intelligence.",
            evidence: `Strengths: ${swot.strengths.join(" ")} Weaknesses: ${swot.weaknesses.join(" ")} Opportunities: ${swot.opportunities.join(" ")} Threats: ${swot.threats.join(" ")}`,
            implication: "Use this as a boardroom summary only because it is derived from the current analysis object.",
            action: "Turn the top weakness and top threat into explicit launch controls."
          }, t)
        : t.noSwot
    );
  } else if (/risk|threat|downside|fragile/.test(lower)) {
    const risks = analysis.strategicIntelligence?.riskAnalysis || [];
    answerParts.push(
      risks.length
        ? consultantAnswer({
            verdict: "Key launch risks are material enough to shape the go/no-go decision.",
            evidence: risks.map((risk) => `${risk.label} (${risk.level}): ${risk.evidence}`).join(" "),
            implication: "The analysis should be presented with risk controls, not just upside metrics.",
            action: "Mitigate the highest-level risk before lease, inventory, or hiring commitment."
          }, t)
        : consultantAnswer({
            verdict: `${t.probability} ${analysis.probability.successProbability}%.`,
            evidence: analysis.probability.explanation,
            implication: "No structured risk module was returned, so the probability explanation is the strongest available risk signal.",
            action: "Collect more competitor, pricing, and district evidence."
          }, t)
    );
  } else if (/gap|underserved|white space|whitespace/.test(lower)) {
    const gaps = analysis.strategicIntelligence?.marketGapDetection || [];
    answerParts.push(
      gaps.length
        ? consultantAnswer({
            verdict: "The strongest whitespace is where underserved score is high and direct competition is low.",
            evidence: gaps.slice(0, 3).map((gap) => `${gap.district}: ${gap.signal}, underserved ${gap.underservedScore}/100, direct competitors ${gap.directCompetitors}.`).join(" "),
            implication: "Treat map gaps as hypotheses until local demand and competitor quality are validated.",
            action: "Visit the top gap district and collect traffic, menu, and competitor evidence."
          }, t)
        : t.noMarketGaps
    );
  } else if (/category|segment|vertical/.test(lower)) {
    const category = analysis.strategicIntelligence?.categoryIntelligence;
    answerParts.push(
      category?.categories?.length
        ? consultantAnswer({
            verdict: category.interpretation,
            evidence: category.categories.slice(0, 3).map((item) => `${item.category}: ${item.competitorCount} competitors, ${item.priceSamples} price samples, avg rating ${item.averageRating || "n/a"}.`).join(" "),
            implication: "Category attractiveness depends on both evidence depth and saturation.",
            action: "Favor the category with enough price evidence and manageable density."
          }, t)
        : t.noCategoryData
    );
  } else if (/competition|competitor|weak|конкур|әлсіз/.test(lower)) {
    const underserved = analysis.opportunityScore.underservedDistricts?.[0];
    answerParts.push(underserved
      ? consultantAnswer({
          verdict: `${t.weakCompetition} ${underserved.area}.`,
          evidence: `${underserved.directCompetitors} direct competitors, ${underserved.nearbyCompetitors} nearby competitors, underserved score ${underserved.underservedScore}/100.`,
          implication: "Weak competition is useful only if demand and budget realism also hold.",
          action: "Benchmark the nearest competitors' pricing, ratings, and traffic before launch."
        }, t)
      : t.noMarketGaps);
  } else {
    answerParts.push(
      consultantAnswer({
        verdict: `${t.mainRecommendation} ${analysis.recommendation.explanation}`,
        evidence: `${t.scoreLine} ${analysis.opportunityScore.score}/100, ${t.successLine} ${analysis.probability.successProbability}%, competitors ${analysis.market?.competitorCount ?? "n/a"}, price samples ${analysis.stats?.sampleCount ?? "n/a"}.`,
        implication: "This recommendation is valid only for the current city, category, budget, and loaded market evidence.",
        action: analysis.recommendation.nextActions?.[0] || "Collect missing market evidence before investor presentation."
      }, t)
    );
  }

  if (analysis.recommendation.nextActions?.length) {
    answerParts.push(`${t.action} ${analysis.recommendation.nextActions[0]}`);
  }

  answerParts.push(buildConfidenceLine({ orchestration, analysis }));

  return answerParts.join("\n\n");
}

function buildBusinessContextMismatchAnswer({ question, analysis, t, resolvedContext }) {
  const mentionedBusiness = resolveBusinessFocusFromText(question) || resolvedContext?.businessType || null;
  const loadedBusiness = analysis.input?.businessType || null;

  if (!mentionedBusiness || !loadedBusiness || mentionedBusiness === loadedBusiness) {
    return null;
  }

  return consultantAnswer({
    verdict: `I understand the follow-up is about ${formatBusinessType(mentionedBusiness)}, but the loaded analytics are for ${formatBusinessType(loadedBusiness)} in ${analysis.input?.city || "the selected city"}.`,
    evidence: `The available metrics are ${formatBusinessType(loadedBusiness)} only: opportunity score ${analysis.opportunityScore?.score}/100, success probability ${analysis.probability?.successProbability}%, ${analysis.market?.competitorCount ?? "n/a"} competitors, and ${analysis.stats?.sampleCount ?? "n/a"} price samples.`,
    implication: "I cannot reuse these metrics as coffee-shop, dessert, pharmacy, or other category analytics without creating unsupported advice.",
    action: `Run a ${formatBusinessType(mentionedBusiness)} analysis for the same city and budget, then I can compare districts, pricing, risks, and underserved demand with the correct scoring outputs.`
  }, t);
}

function buildComparativeSimulationAnswer({ lower, t, orchestration }) {
  if (!matches(lower, ["simulation", "simulate", "before", "after", "optimization", "optimisation", "improve probability", "probability improved", "compare scenarios", "stress-test"])) {
    return null;
  }

  const simulation = orchestration?.businessIntelligence?.comparativeSimulations?.[0];

  if (!simulation) {
    return consultantAnswer({
      verdict: "A comparative simulation is not available from the current analytics payload.",
      evidence: "The assistant needs district rankings, probability assumptions, budget plan, pricing evidence, and risk modules to compare before-versus-after scenarios.",
      implication: "Without those calculated inputs, any probability delta would be invented.",
      action: "Run a complete market analysis, then ask for district optimization or risk simulation again."
    }, t);
  }

  const risks = simulation.riskComparison || {};

  return consultantAnswer({
    verdict: `${simulation.name}: ${simulation.before.scenario || "Scenario A"} is ${simulation.before.successProbability}% in ${simulation.before.district}; ${simulation.after.scenario || "Scenario B"} is ${simulation.after.successProbability}% in ${simulation.after.district}. Net change: ${simulation.probabilityDelta.points} points.`,
    evidence: [
      `${simulation.before.scenario || "Scenario A"} risk: ${simulation.before.risk}; opportunity: ${simulation.before.opportunity}; why: ${simulation.before.why}`,
      `${simulation.after.scenario || "Scenario B"} risk: ${simulation.after.risk}; opportunity: ${simulation.after.opportunity}; why: ${simulation.after.why}`,
      simulation.probabilityDelta.explanation,
      `Oversaturation risk: ${risks.oversaturation?.before || "n/a"} -> ${risks.oversaturation?.after || "n/a"} ${risks.oversaturation?.impact || ""}`,
      `Low-budget risk: ${risks.lowBudget?.after || "n/a"} ${risks.lowBudget?.impact || ""}`,
      `Weak-demand risk: ${risks.weakDemand?.before || "n/a"} -> ${risks.weakDemand?.after || "n/a"} ${risks.weakDemand?.impact || ""}`,
      `Aggressive competition risk: ${risks.aggressiveCompetition?.before || "n/a"} -> ${risks.aggressiveCompetition?.after || "n/a"} ${risks.aggressiveCompetition?.impact || ""}`,
      `Pricing risk: ${risks.pricing?.after || "n/a"} ${risks.pricing?.impact || ""}`
    ].join(" "),
    implication: simulation.guardrail,
    action: "Use the optimized district as the next validation target, then rerun the scoring engine if budget, category, or pricing assumptions change."
  }, t);
}

function buildStrategicAdvisorAnswer({ lower, analysis, t, orchestration }) {
  const engine = analysis.marketGapEngine || orchestration?.businessIntelligence?.marketGapEngine || null;
  const advisor = engine?.strategicAdvisor || null;
  const boi = engine?.boi || null;
  const detections = engine?.detections || {};
  const wantsAdvisor = matches(lower, ["boi", "business opportunity index", "opportunity index", "challenge", "weak idea", "bad idea", "pivot", "alternative", "alternatives", "compare business plans", "market gap", "missing categor", "underserved", "unmet demand"]);

  if (!wantsAdvisor || !engine) {
    return null;
  }

  const topGap = [
    ...(detections.missingCategories || []),
    ...(detections.underservedPricingSegments || []),
    ...(detections.weakMarketCoverage || []),
    ...(detections.unmetDemandIndicators || [])
  ].sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0];
  const pivotText = advisor?.pivots?.length
    ? advisor.pivots.slice(0, 3).map((pivot) => `${pivot.recommendation}: ${pivot.why}`).join(" ")
    : "No pivot was generated by the market gap engine.";
  const alternatives = advisor?.alternatives?.length
    ? advisor.alternatives.slice(0, 3).map((item) => `${item.title}: ${item.reason}`).join(" ")
    : "No lower-risk alternative category was returned by the budget intelligence module.";

  return consultantAnswer({
    verdict: `BOI Score: ${boi?.score ?? "n/a"}/100 (${boi?.label || "not classified"}). Strategic stance: ${advisor?.stance || "not available"}.`,
    evidence: [
      boi?.explanation || "BOI explanation is unavailable.",
      advisor?.challenge || "No challenge statement was returned.",
      topGap ? `Top market gap signal: ${topGap.evidence} Why it matters: ${topGap.whyItMatters}` : "No major market gap signal was confirmed.",
      `Pivots: ${pivotText}`,
      `Alternatives: ${alternatives}`
    ].join(" "),
    implication: "The recommendation is not a profitability promise; it is a commercial decision read from competition, demand, market gaps, accessibility, sentiment, saturation, and growth trend evidence.",
    action: advisor?.pivots?.[0]?.recommendation || analysis.recommendation?.nextActions?.[0] || "Collect more district-level market evidence before committing capital."
  }, t);
}

function buildBudgetScenarioAnswer({ question, analysis, t, resolvedContext }) {
  const proposedBudget = extractBudgetFromText(question) || resolvedContext?.budget || null;
  const lower = String(question || "").toLowerCase();
  const isBudgetFollowUp = proposedBudget && /budget|increase|increases|more|what if|million|kzt|\u20b8|tenge/i.test(lower);

  if (!isBudgetFollowUp) {
    return null;
  }

  const currentBudget = Number(analysis.input?.budget || resolvedContext?.previousBudget || 0);
  const minimumViableBudget = Number(analysis.budgetPlan?.minimumViableBudget || 0);
  const currentRisk = analysis.budgetPlan?.budgetRiskLevel || "unknown";
  const businessType = analysis.profile?.title || formatBusinessType(analysis.input?.businessType);
  const city = analysis.input?.city || resolvedContext?.city || "the selected city";
  const difference = proposedBudget - currentBudget;
  const adequacyRatio = minimumViableBudget ? Math.round((proposedBudget / minimumViableBudget) * 100) : null;
  const budgetRead = minimumViableBudget
    ? proposedBudget >= minimumViableBudget
      ? `The proposed budget is ${adequacyRatio}% of the minimum viable budget (${formatMoney(minimumViableBudget)} KZT).`
      : `The proposed budget is still ${formatMoney(minimumViableBudget - proposedBudget)} KZT below the minimum viable budget (${formatMoney(minimumViableBudget)} KZT).`
    : "The minimum viable budget is not available in the current analytics.";

  return consultantAnswer({
    verdict: `I understand this as a follow-up on ${businessType} in ${city}: changing budget from ${formatMoney(currentBudget)} KZT to ${formatMoney(proposedBudget)} KZT.`,
    evidence: `${budgetRead} The loaded analysis still has opportunity score ${analysis.opportunityScore?.score}/100, success probability ${analysis.probability?.successProbability}%, current budget risk ${currentRisk}, ${analysis.market?.competitorCount ?? "n/a"} competitors, and ${analysis.stats?.sampleCount ?? "n/a"} price samples.`,
    implication: difference > 0
      ? "A higher budget can improve capital adequacy and runway, but exact probability, break-even, and investor-scenario values require rerunning the scoring engine with the new budget."
      : "A lower budget can weaken runway and budget realism; exact impact requires rerunning the scoring engine with the new budget.",
    action: `Rerun the analysis for ${formatMoney(proposedBudget)} KZT before treating the revised probability or district ranking as final.`
  }, t);
}

function resolveBusinessFocusFromText(text) {
  const value = String(text || "").toLowerCase();

  if (matches(value, ["coffee shop", "coffee shops", "cafe", "cafes", "coffee"])) {
    return "coffee_shop";
  }

  if (matches(value, ["dessert cafe", "dessert cafes", "dessert", "bakery", "pastry"])) {
    return "dessert_cafe";
  }

  if (matches(value, ["grocery", "groceries", "supermarket", "food store"])) {
    return "grocery";
  }

  if (matches(value, ["pharmacy", "drugstore"])) {
    return "pharmacy";
  }

  if (matches(value, ["fitness", "gym"])) {
    return "fitness";
  }

  if (matches(value, ["beauty salon", "salon", "barber"])) {
    return "beauty_salon";
  }

  if (matches(value, ["restaurant", "restaurants", "dining"])) {
    return "restaurant";
  }

  return null;
}

function buildConfidenceLine({ orchestration, analysis }) {
  const confidence = orchestration?.businessIntelligence?.aiConfidence || null;
  const fallbackScore = analysis?.investorDecision?.dataRoom?.score ?? analysis?.probability?.assumptions?.evidenceScore ?? 0;
  const label = confidence?.label || (fallbackScore >= 76 ? "High" : fallbackScore >= 52 ? "Medium" : "Low");
  const explanation = confidence?.explanation || `derived from available evidence score ${fallbackScore}/100, competitor count ${analysis?.market?.competitorCount ?? "n/a"}, and price samples ${analysis?.stats?.sampleCount ?? "n/a"}`;

  return `AI Confidence: ${label}. ${explanation}`;
}

function ensureConfidenceDisclosure(reply, aiConfidence) {
  const text = String(reply || "");

  if (/AI Confidence:/i.test(text)) {
    return text;
  }

  const label = aiConfidence?.label || "Low";
  const explanation = aiConfidence?.explanation || "confidence is limited because data availability, market clarity, or analytics completeness is incomplete.";

  return `${text}\n\nAI Confidence: ${label}. ${explanation}`;
}

function buildTargetedConsultantAnswer({ lower, analysis, t, topPrices }) {
  if (matches(lower, ["challenge", "pressure test", "pressure-test", "weak idea", "bad idea", "pivot", "alternative", "alternatives", "compare business", "compare plans", "lower risk", "boi", "business opportunity index"])) {
    return buildStrategicAdvisorAnswer({ analysis, t });
  }

  if (matches(lower, ["what business", "which business", "business should", "should i open", "what should i open", "business idea", "business ideas", "open in", "category to open"])) {
    const category = pickBestCategory(analysis);
    const district = getBestDistrict(analysis);

    if (category) {
      return consultantAnswer({
        verdict: `Pilot ${category.category || analysis.profile?.title} first in ${district?.name || analysis.recommendation?.bestArea || "the top-ranked district"}.`,
        evidence: `${category.category || analysis.profile?.title}: ${category.competitorCount ?? "n/a"} competitors, ${category.priceSamples ?? "n/a"} price samples, average price ${formatMoney(category.averagePrice)} KZT, average rating ${category.averageRating || "n/a"}. Opportunity score is ${analysis.opportunityScore.score}/100 and success probability is ${analysis.probability.successProbability}%.`,
        implication: "This recommendation is based on the current category, district, pricing, saturation, and probability analytics.",
        action: analysis.recommendation.nextActions?.[0] || "Run a validation pilot before signing a lease."
      }, t);
    }

    return consultantAnswer({
      verdict: `${analysis.profile?.title || "The selected category"} is the only analyzed business category in the current result.`,
      evidence: `${t.scoreLine} ${analysis.opportunityScore.score}/100, ${t.successLine} ${analysis.probability.successProbability}%, competitors ${analysis.market?.competitorCount ?? "n/a"}, price samples ${analysis.stats?.sampleCount ?? "n/a"}.`,
      implication: "To compare multiple business ideas, run analyses for each candidate category so the assistant can compare real platform scores.",
      action: "Compare opportunity score, success probability, saturation, break-even, and data confidence across categories."
    }, t);
  }

  if (matches(lower, ["oversaturated", "saturated", "saturation", "too crowded", "crowded market"])) {
    return consultantAnswer({
      verdict: `Market saturation is ${analysis.opportunityScore.saturation}.`,
      evidence: getSaturationRead(analysis),
      implication: "Higher saturation lowers the opportunity score because the platform weighs nearby competitors, density, underserved demand, and district economics.",
      action: "Prefer districts with lower nearby competitors and stronger underserved scores before committing to a launch zone."
    }, t);
  }

  if (matches(lower, ["lowest competition", "least competition", "weak competition", "low competition", "category has the lowest competition"])) {
    const category = pickLowestCompetitionCategory(analysis);
    const district = getLowestCompetitionDistrict(analysis);

    return consultantAnswer({
      verdict: category
        ? `${category.category} has the lowest category-level competition in the current analytics.`
        : `${t.weakCompetition} ${district?.name || district?.district || "the lowest-density district"}.`,
      evidence: category
        ? `${category.category}: ${category.competitorCount} competitors, ${category.priceSamples} price samples, average rating ${category.averageRating || "n/a"}.`
        : district
          ? `${district.nearbyCompetitors ?? district.competitorCountNearby ?? "n/a"} nearby competitors, saturation ${district.saturation}, underserved score ${district.underservedScore ?? "n/a"}/100, opportunity score ${district.opportunityScore ?? district.score ?? "n/a"}/100.`
          : "The current analysis did not return category or district competition records.",
      implication: "Low competition is attractive only when demand, budget realism, and price evidence also support the launch.",
      action: "Validate nearest competitor quality, ratings, price levels, and foot traffic before using low density as a launch thesis."
    }, t);
  }

  if (matches(lower, ["demand growing", "growth", "where is demand", "demand", "underserved", "market gap", "white space", "whitespace"])) {
    const growth = getGrowthSignal(analysis);
    return consultantAnswer({
      verdict: growth.verdict,
      evidence: growth.evidence,
      implication: "Demand growth is inferred from underserved demand, foot traffic, market gap detection, heatmap zones, and district scoring.",
      action: growth.action
    }, t);
  }

  if (matches(lower, ["forecast", "financial", "break-even", "breakeven", "runway", "profit", "revenue", "payback"])) {
    const forecast = getFinancialForecast(analysis);
    return consultantAnswer({
      verdict: forecast.verdict,
      evidence: forecast.evidence,
      implication: "The financial view uses the platform's probability assumptions, budget plan, profitability projection, and investor scenario model.",
      action: forecast.action
    }, t);
  }

  if (matches(lower, ["price", "pricing", "charge", "menu price", "price strategy"])) {
    if (!(analysis.recommendation.suggestedPrice > 0)) {
      return t.noPrices;
    }

    return consultantAnswer({
      verdict: `${t.priceAdvice} ${formatMoney(analysis.recommendation.suggestedPrice)} KZT.`,
      evidence: `${analysis.recommendation.pricingStrategy} ${topPrices ? `${t.visiblePrices} ${topPrices}.` : ""}`,
      implication: `Pricing posture: ${analysis.recommendation.pricePosition || "not specified by the analysis"}.`,
      action: "Validate the final launch price with comparable menu, catalog, or receipt samples."
    }, t);
  }

  if (matches(lower, ["risk", "risks", "downside", "fragile"])) {
    const risks = analysis.strategicIntelligence?.riskAnalysis || [];

    return risks.length
      ? consultantAnswer({
          verdict: "Key launch risks are material enough to shape the go/no-go decision.",
          evidence: risks.map((risk) => `${risk.label} (${risk.level}): ${risk.evidence}`).join(" "),
          implication: "The analysis should be presented with risk controls, not just upside metrics.",
          action: "Mitigate the highest-level risk before lease, inventory, or hiring commitment."
        }, t)
      : consultantAnswer({
          verdict: `${t.probability} ${analysis.probability.successProbability}%.`,
          evidence: analysis.probability.explanation,
          implication: "No structured risk module was returned, so the probability explanation is the strongest available risk signal.",
          action: "Collect more competitor, pricing, and district evidence."
        }, t);
  }

  return null;
}

function buildStrategicAdvisorAnswer({ analysis, t }) {
  const advisor = analysis.marketGapEngine?.strategicAdvisor || null;
  const boi = analysis.marketGapEngine?.boi || null;
  const comparison = advisor?.comparison || null;
  const pivots = advisor?.pivots || [];
  const alternatives = advisor?.alternatives || analysis.proprietaryScoring?.budgetIntelligence?.alternativeRecommendations || [];
  const risks = advisor?.risksToExplain || [];
  const currentPlan = analysis.profile?.title || formatBusinessType(analysis.input?.businessType);
  const firstAlternative = comparison?.alternatives?.[0] || alternatives[0] || null;
  const challenge = advisor?.challenge || (
    analysis.budgetPlan?.isBelowMinimum
      ? `The current plan is underfunded by ${formatMoney(analysis.budgetPlan.budgetShortfall)} KZT versus the ${formatMoney(analysis.budgetPlan.minimumViableBudget)} KZT minimum viable threshold.`
      : `The current plan needs validation against budget realism ${analysis.budgetPlan?.budgetRealismScore ?? "n/a"}/100, saturation ${analysis.opportunityScore?.saturation || "n/a"}, and evidence depth ${analysis.stats?.sampleCount ?? 0} price samples.`
  );

  return consultantAnswer({
    verdict: boi
      ? `${currentPlan} should be treated as ${advisor?.stance === "challenge_or_pivot" ? "a challenge-or-pivot case" : "supportable with validation"} because BOI is ${boi.score}/100 (${boi.label}).`
      : `${currentPlan} should be pressure-tested before launch.`,
    evidence: [
      challenge,
      boi?.explanation,
      comparison?.advisorRead,
      risks.length ? `Risks to explain: ${risks.join(", ")}.` : null
    ].filter(Boolean).join(" "),
    implication: firstAlternative
      ? `${firstAlternative.title || firstAlternative.businessType || "The top alternative"} is the first lower-risk comparison point because ${firstAlternative.reason || firstAlternative.expectedRisk || "it is recommended by budget intelligence"}.`
      : "If no alternative is calculated, the advisor should reduce scope, validate district demand, and avoid fixed costs until the weak assumptions are resolved.",
    action: pivots.length
      ? pivots.slice(0, 3).map((pivot) => `${pivot.recommendation} Why: ${pivot.why}`).join(" ")
      : "Run a smaller pilot, collect stronger price evidence, and compare at least one lower-capital format before committing."
  }, t);
}

function matches(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function pickBestCategory(analysis) {
  const categories = analysis.strategicIntelligence?.categoryIntelligence?.categories || analysis.businessCategoryStats || [];

  return categories
    .slice()
    .sort((left, right) => {
      const leftScore = (Number(left.priceSamples) || 0) * 3 + (Number(left.averageRating) || 0) * 8 - (Number(left.competitorCount) || 0) * 2;
      const rightScore = (Number(right.priceSamples) || 0) * 3 + (Number(right.averageRating) || 0) * 8 - (Number(right.competitorCount) || 0) * 2;
      return rightScore - leftScore;
    })[0] || null;
}

function pickLowestCompetitionCategory(analysis) {
  const categories = analysis.strategicIntelligence?.categoryIntelligence?.categories || analysis.businessCategoryStats || [];

  return categories
    .filter((category) => Number.isFinite(Number(category.competitorCount)))
    .slice()
    .sort((left, right) => Number(left.competitorCount) - Number(right.competitorCount))[0] || null;
}

function getBestDistrict(analysis) {
  return analysis.opportunityAreas?.[0] || analysis.districtMetrics?.[0] || null;
}

function getLowestCompetitionDistrict(analysis) {
  const districts = analysis.districtMetrics?.length ? analysis.districtMetrics : analysis.opportunityAreas || [];

  return districts
    .slice()
    .sort((left, right) => Number(left.nearbyCompetitors ?? left.competitorCountNearby ?? 999) - Number(right.nearbyCompetitors ?? right.competitorCountNearby ?? 999))[0] || null;
}

function getSaturationRead(analysis) {
  const districts = analysis.saturationData?.districts || analysis.opportunityAreas || [];
  const districtText = districts.slice(0, 4).map((district) => {
    const name = district.district || district.name;
    const nearby = district.nearbyCompetitors ?? district.competitorCountNearby ?? "n/a";
    return `${name}: ${district.saturation}, ${nearby} nearby competitors`;
  }).join("; ");

  return `Overall density is ${analysis.market?.density || "n/a"} with ${analysis.market?.competitorCount ?? "n/a"} competitors. ${districtText || "No district saturation records were returned."}`;
}

function getGrowthSignal(analysis) {
  const gap = analysis.strategicIntelligence?.marketGapDetection?.[0];
  const district = analysis.districtMetrics?.[0] || analysis.opportunityAreas?.[0];
  const insight = analysis.growthInsights?.[0];

  if (gap) {
    return {
      verdict: `${gap.district} is the strongest visible market gap.`,
      evidence: `${gap.signal}, underserved ${gap.underservedScore}/100, direct competitors ${gap.directCompetitors}, nearby competitors ${gap.nearbyCompetitors}.`,
      action: "Validate this gap with local foot-traffic checks and competitor price sampling."
    };
  }

  if (district) {
    return {
      verdict: `${district.district || district.name} has the strongest demand signal in the current district ranking.`,
      evidence: `Opportunity ${district.opportunityScore ?? district.score}/100, foot traffic ${district.footTraffic ?? "n/a"}/100, underserved demand ${district.underservedScore ?? "n/a"}/100, saturation ${district.saturation}. ${insight ? `${insight.title}: ${insight.body}` : ""}`,
      action: "Use this district as the first demand validation zone before expanding."
    };
  }

  return {
    verdict: "No growth district is confirmed by the current analytics.",
    evidence: "The analysis did not return district demand or market gap records.",
    action: "Run a richer district analysis before making a growth claim."
  };
}

function getFinancialForecast(analysis) {
  const scenario = analysis.investorDecision?.scenarios?.[0];
  const board = analysis.investorDecision?.boardMetrics || [];
  const projectedRevenue = analysis.probability?.assumptions?.projectedMonthlyRevenue;
  const projectedProfit = analysis.probability?.assumptions?.projectedNetProfit;
  const payback = analysis.probability?.assumptions?.paybackMonths;
  const breakEven = analysis.budgetPlan?.breakEvenTransactions;
  const runway = analysis.budgetPlan?.runwayMonths;

  return {
    verdict: scenario ? `${scenario.name}: ${scenario.status}.` : `Projected monthly net profit is ${formatMoney(projectedProfit)} KZT.`,
    evidence: scenario
      ? `Revenue ${formatMoney(scenario.revenue)} KZT, net profit ${formatMoney(scenario.netProfit)} KZT, break-even ${scenario.breakEvenTransactions} sales/mo, margin ${scenario.marginPercent}%. Runway is ${runway} months.`
      : `Projected revenue ${formatMoney(projectedRevenue)} KZT, projected net profit ${formatMoney(projectedProfit)} KZT, break-even ${breakEven ?? "n/a"} sales/mo, payback ${payback || "not positive"}, board metrics: ${board.map((item) => `${item.label}: ${item.value}`).join("; ") || "n/a"}.`,
    action: analysis.budgetPlan?.isBelowMinimum
      ? `Raise at least ${formatMoney(analysis.budgetPlan.budgetShortfall)} KZT or reduce launch scope before treating the model as viable.`
      : "Use break-even and runway as the investor gate before scaling."
  };
}

function consultantAnswer({ verdict, evidence, implication, action }, t) {
  return [
    `${t.verdict} ${verdict}`,
    evidence ? `${t.evidence} ${evidence}` : null,
    implication ? `${t.implication} ${implication}` : null,
    action ? `${t.action} ${action}` : null
  ].filter(Boolean).join("\n");
}

function normalizeMessages(messages) {
  return (messages || [])
    .filter((message) => message && ["user", "assistant", "system"].includes(message.role) && message.content)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 4000)
    }));
}

function sanitizeDirectGeminiConversation(messages) {
  return normalizeMessages(messages)
    .filter((message) => {
      if (message.role !== "assistant") {
        return true;
      }

      return !/(strategic assessment|merc[aа]ro consultant|business opportunity index|success probability|^verdict:|^evidence:)/i.test(message.content);
    })
    .slice(-12);
}

function splitIntoChunks(text) {
  const words = String(text || "").split(/(\s+)/);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if ((current + word).length > 34) {
      if (current) {
        chunks.push(current);
      }
      current = word;
    } else {
      current += word;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function defaultDictionary() {
  return {
    noAnalysis: "Run a market analysis first. I will not invent a recommendation without current competitors, prices, and map signals.",
    providerFallback: "External provider unavailable; using calculated platform data only.",
    bestDistrict: "Best district:",
    noRankedDistrict: "No ranked district was returned by the scoring engine.",
    priceAdvice: "Recommended launch price:",
    noPrices: "Verified product-level prices are not strong enough to support a launch price.",
    visiblePrices: "Visible prices:",
    probability: "Success probability:",
    weakCompetition: "Competition is weakest in",
    noMarketGaps: "No market gap is confirmed by the current district metrics.",
    noCategoryData: "Category data is not strong enough to support a category-level answer.",
    noSwot: "SWOT was not returned in the structured analysis data.",
    mainRecommendation: "Main recommendation:",
    scoreLine: "Opportunity score",
    successLine: "success probability",
    nextStep: "Next step:",
    verdict: "Verdict:",
    evidence: "Evidence:",
    implication: "Implication:",
    action: "Recommended action:"
  };
}

function dictionary(language) {
  if (language === "ru") {
    return {
      noAnalysis: "Сначала запустите анализ рынка: без текущих конкурентов, цен и карты я не буду придумывать рекомендацию.",
      bestDistrict: "Лучший район:",
      priceAdvice: "Рекомендуемая стартовая цена:",
      noPrices: "Публичных товарных цен недостаточно. Сначала соберите меню, прайсы или чеки по 8-12 позициям.",
      visiblePrices: "Видимые цены:",
      probability: "Вероятность успеха:",
      weakCompetition: "Самая слабая конкуренция сейчас в районе",
      mainRecommendation: "Главная рекомендация:",
      scoreLine: "Оценка возможности",
      successLine: "вероятность успеха",
      nextStep: "Следующий шаг:"
    };
  }

  if (language === "kk") {
    return {
      noAnalysis: "Алдымен нарық талдауын іске қосыңыз: нақты бәсекелестер, бағалар және карта болмаса, ұсыныс ойдан шығарылмайды.",
      bestDistrict: "Ең жақсы аудан:",
      priceAdvice: "Ұсынылатын бастапқы баға:",
      noPrices: "Қоғамдық өнім бағалары жеткіліксіз. Алдымен 8-12 мәзір немесе чек бағасын жинаңыз.",
      visiblePrices: "Көрінетін бағалар:",
      probability: "Табыс ықтималдығы:",
      weakCompetition: "Қазір бәсеке ең әлсіз аудан",
      mainRecommendation: "Негізгі ұсыныс:",
      scoreLine: "Мүмкіндік бағасы",
      successLine: "табыс ықтималдығы",
      nextStep: "Келесі қадам:"
    };
  }

  return {
    noAnalysis: "Run a market analysis first. I will not invent a recommendation without current competitors, prices, and map signals.",
    bestDistrict: "Best district:",
    priceAdvice: "Recommended launch price:",
    noPrices: "Verified product-level prices are not strong enough yet. Collect menus, price lists, or receipts for 8-12 comparable items.",
    visiblePrices: "Visible prices:",
    probability: "Success probability:",
    weakCompetition: "Competition is weakest in",
    mainRecommendation: "Main recommendation:",
    scoreLine: "Opportunity score",
    successLine: "success probability",
    nextStep: "Next step:"
  };
}

function languageName(language) {
  if (language === "ru") {
    return "Russian";
  }

  if (language === "kk") {
    return "Kazakh";
  }

  return "English";
}

function formatMoney(value) {
  const number = Number(value);

  return Number.isFinite(number) ? new Intl.NumberFormat("ru-RU").format(number) : "n/a";
}

function formatBusinessType(value) {
  return String(value || "business").replace(/_/g, " ");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  createChatReply,
  streamChatReply
};
