"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  BadgeCheck,
  Bot,
  BrainCircuit,
  Building2,
  Calculator,
  Database,
  Download,
  Gauge,
  Globe2,
  History,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPinned,
  Moon,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Table2,
  Target,
  TrendingUp,
  User
} from "lucide-react";
import {
  buildExportHtmlReport,
  buildExportReport,
  cancelPlannedBusiness,
  createPlannedBusiness,
  loadPlannedBusinesses,
  loadSavedAnalyses,
  loadSystemState,
  requestAnalysis,
  submitProperty,
  submitAuthRequest,
  streamChatRequest
} from "../../lib/api";
import { compactAnalysisForChat, readSseStream } from "../../lib/chat";
import { chartColors, fallbackOptions, metricIcons } from "../../lib/constants";
import { downloadBlob } from "../../lib/download";
import { saveLastAnalysis, loadLastAnalysis } from "../../lib/analysis-store";
import { useAccess, AccessGate } from "../../components/access-provider";
import { BasicAnalysis } from "../../components/basic-analysis";
import { LANGUAGE_LABELS, getUiCopy } from "../../lib/i18n";
import {
  compactMoney,
  formatBoardMetric,
  formatBusinessType,
  formatFactorName,
  formatMoney,
  getDensityTone,
  getDistrictHeat,
  getSaturationTone
} from "../../lib/formatters";
import {
  ChartCard,
  DashboardSection,
  DashboardSkeleton,
  EmptyState,
  ErrorState,
  FactorBar,
  Kpi,
  Toolbar
} from "../../components/ui/dashboard-primitives";
import { InvestorConsole } from "../../components/ui/investor-console";
import { PlatformNav } from "../../components/ui/platform-pages";

const CompetitorLeafletMap = dynamic(() => import("../components/CompetitorLeafletMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">Loading interactive map...</div>
});

const MAX_VISIBLE_PRICES = 48;
const MAX_VISIBLE_COMPETITORS = 80;
const ANALYSIS_LOADING_STAGES = [
  "Analyzing location...",
  "Checking competition...",
  "Processing market data...",
  "Calculating opportunity...",
  "Preparing recommendation..."
];

export default function HomePage() {
  const { session, can, refresh: refreshAccess, logout: signOut, access, status: accessStatus, language, setLanguage } = useAccess();
  const [theme, setTheme] = useState("light");
  const [form, setForm] = useState({
    country: "Kazakhstan",
    city: "",
    budget: "",
    businessType: "",
    preferredLocation: "",
    targetAudience: "",
    businessFormat: ""
  });
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState(fallbackOptions);
  const [status, setStatus] = useState("checking");
  const [database, setDatabase] = useState(null);
  const [analysisPhase, setAnalysisPhase] = useState("idle");
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "", company: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [competitorQuery, setCompetitorQuery] = useState("");
  const [priceQuery, setPriceQuery] = useState("");
  const [plannedBusinesses, setPlannedBusinesses] = useState([]);
  const [myPlannedBusinesses, setMyPlannedBusinesses] = useState([]);
  const [planModal, setPlanModal] = useState(null);
  const [planForm, setPlanForm] = useState({ businessName: "", budget: "", businessFormat: "" });
  const [planStatus, setPlanStatus] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [propertyTransactionFilter, setPropertyTransactionFilter] = useState("ALL");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("ALL");
  const [propertyMaxPrice, setPropertyMaxPrice] = useState("");
  const [propertyMinArea, setPropertyMinArea] = useState("");
  const [propertyMaxDistance, setPropertyMaxDistance] = useState("");
  const [propertySubmissionOpen, setPropertySubmissionOpen] = useState(false);
  const [propertySubmitStatus, setPropertySubmitStatus] = useState("");
  const [propertyForm, setPropertyForm] = useState({ title: "", propertyType: "", transactionType: "RENT", price: "", areaSqm: "", address: "", latitude: "", longitude: "", sourceUrl: "", contactPhone: "", contactEmail: "" });
  const [fullAnalysisOpen, setFullAnalysisOpen] = useState(false);
  const [whyScoreOpen, setWhyScoreOpen] = useState(false);
  const [selectedDecisionLocation, setSelectedDecisionLocation] = useState(null);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const analysisAbortRef = useRef(null);
  const chatBusyRef = useRef(false);
  const discoveryContextRef = useRef(null);
  const assistantDeepLinkPromptRef = useRef("");
  const chatWindowRef = useRef(null);
  const historyRequestRef = useRef(0);

  const t = getUiCopy(language);
  const selectedProfile = options.profiles?.[form.businessType];
  const selectedBusinessLabel = form.businessType ? formatBusinessType(form.businessType, options.profiles) : "";
  const analysisHeading = form.city && selectedBusinessLabel ? `${selectedBusinessLabel} in ${form.city}` : t.welcomeTitle;
  const deferredCompetitorQuery = useDeferredValue(competitorQuery);
  const deferredPriceQuery = useDeferredValue(priceQuery);
  const budgetValue = Number(form.budget);
  const isBudgetValid = Number.isFinite(budgetValue) && budgetValue > 0;
  const isFormComplete = Boolean(form.city && form.businessType && isBudgetValid);
  const analysisBusy = analysisPhase !== "idle";
  const isInitialAnalysisLoading = analysisPhase === "initial" && !result;
  const isRefreshingAnalysis = analysisPhase === "refresh" && Boolean(result);

  const summaryCards = useMemo(() => {
    if (!can("OPPORTUNITY_SCORE") || (result && !result.opportunityScore)) {
      return [
        { label: t.city || "City", value: result?.input?.city || form.city || "-", icon: metricIcons.district },
        { label: t.competitors || "Competitors", value: result ? String(result.market?.competitorCount ?? 0) : "-", icon: metricIcons.opportunity }
      ];
    }
    if (!result) {
      return [
        { label: "Opportunity", value: "—", icon: metricIcons.opportunity },
        { label: "Risk", value: "—", icon: metricIcons.success },
        { label: "Data confidence", value: "—", icon: metricIcons.confidence },
        { label: "Best district", value: "—", icon: metricIcons.district }
      ];
    }

    return [
      { label: "BOI", value: result.marketGapEngine?.boi ? `${result.marketGapEngine.boi.score}/100` : "n/a", icon: metricIcons.opportunity },
      { label: "Opportunity", value: `${result.opportunityScore.score}/100`, icon: metricIcons.opportunity },
      { label: "Success", value: `${result.probability.successProbability}%`, icon: metricIcons.success },
      { label: "Confidence", value: `${result.investorDecision?.dataRoom?.score ?? result.probability.assumptions.evidenceScore}/100`, icon: metricIcons.confidence },
      { label: "Best district", value: result.recommendation.bestArea || "n/a", icon: metricIcons.district }
    ];
  }, [result, accessStatus, access.plan, access.role, language, form.city]);

  const districtRankings = useMemo(() => {
    return (result?.districtMetrics || []).slice(0, 6).map((district) => ({
      ...district,
      heat: getDistrictHeat(district)
    }));
  }, [result]);

  const liveAnalytics = useMemo(() => {
    if (!result?.opportunityScore || !result?.probability) {
      return [];
    }

    return [
      { label: "Live refresh", value: result.meta?.refreshSeconds != null ? `${result.meta.refreshSeconds}s` : "n/a", tone: "green" },
      { label: "Density", value: result.market.density, tone: getDensityTone(result.market.density) },
      { label: "Saturation", value: result.opportunityScore.saturation, tone: getSaturationTone(result.opportunityScore.saturation) },
      { label: "Probability band", value: result.probability.level, tone: "blue" }
    ];
  }, [result]);

  const filteredCompetitors = useMemo(() => {
    const query = deferredCompetitorQuery.trim().toLowerCase();
    const rows = result?.competitors || [];

    return rows.filter((competitor) =>
      query
        ? [competitor.name, competitor.area, competitor.address, competitor.category, competitor.sourceName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        : true
    );
  }, [deferredCompetitorQuery, result]);

  const filteredPrices = useMemo(() => {
    const query = deferredPriceQuery.trim().toLowerCase();
    const rows = result?.prices || [];

    return rows.filter((record) =>
      query
        ? [record.productName, record.businessName, record.area, record.category, record.sourceName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        : true
    );
  }, [deferredPriceQuery, result]);

  const visibleCompetitors = useMemo(() => filteredCompetitors.slice(0, MAX_VISIBLE_COMPETITORS), [filteredCompetitors]);
  const visiblePrices = useMemo(() => filteredPrices.slice(0, MAX_VISIBLE_PRICES), [filteredPrices]);
  const hiddenCompetitorCount = Math.max(0, filteredCompetitors.length - visibleCompetitors.length);
  const hiddenPriceCount = Math.max(0, filteredPrices.length - visiblePrices.length);
  const projectedMarket = result?.projectedMarket || null;
  const plannedImpact = projectedMarket || {
    existingCompetitors: result?.market?.competitorCount ?? null,
    plannedCompetitors: null,
    verifiedCompetitors: null,
    futureMarketPressure: null,
    projectedOpportunityScore: null,
    timeline: []
  };
  const properties = result?.propertyMarketplace?.properties || [];
  const propertyTypes = [...new Set(properties.map((property) => property.propertyType).filter(Boolean))];
  const filteredProperties = properties
    .map((property) => {
      const coordinates = property.coordinates || { lat: property.latitude, lng: property.longitude };
      const selectedDistanceKm = selectedDecisionLocation?.coordinates && coordinates?.lat != null && coordinates?.lng != null
        ? calculateDistanceKm(selectedDecisionLocation.coordinates, coordinates)
        : property.distanceKm;
      return { ...property, selectedDistanceKm };
    })
    .filter((property) => {
      if (propertyTransactionFilter !== "ALL" && property.transactionType !== propertyTransactionFilter) return false;
      if (propertyTypeFilter !== "ALL" && property.propertyType !== propertyTypeFilter) return false;
      if (propertyMaxPrice && property.price > Number(propertyMaxPrice)) return false;
      if (propertyMinArea && property.areaSqm < Number(propertyMinArea)) return false;
      if (propertyMaxDistance && property.selectedDistanceKm != null && property.selectedDistanceKm > Number(propertyMaxDistance)) return false;
      return true;
    })
    .sort((left, right) => Number(left.selectedDistanceKm ?? Number.POSITIVE_INFINITY) - Number(right.selectedDistanceKm ?? Number.POSITIVE_INFINITY));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [theme, language]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("mercoraPrompt");
    if (prompt) {
      assistantDeepLinkPromptRef.current = prompt;
      setChatInput(prompt);
    }
    try {
      discoveryContextRef.current = JSON.parse(window.sessionStorage.getItem("mercora.discovery.ai-context.v1") || "null");
      window.sessionStorage.removeItem("mercora.discovery.ai-context.v1");
    } catch {
      discoveryContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!assistantDeepLinkPromptRef.current) return;
    window.requestAnimationFrame(() => document.getElementById("mercora-ai")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    assistantDeepLinkPromptRef.current = "";
  }, [chatInput]);

  useEffect(() => {
    if (!analysisBusy) {
      setLoadingStageIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setLoadingStageIndex((current) => Math.min(current + 1, ANALYSIS_LOADING_STAGES.length - 1));
    }, 1400);
    return () => window.clearInterval(timer);
  }, [analysisBusy]);

  useEffect(() => {
    if (!result) {
      setSelectedDecisionLocation(null);
      setFullAnalysisOpen(false);
      setWhyScoreOpen(false);
      return;
    }

    const preferred = String(result.input?.preferredLocation || "").trim().toLowerCase();
    const preferredArea = preferred
      ? (result.opportunityAreas || []).find((area) => String(area.name || "").toLowerCase().includes(preferred) || preferred.includes(String(area.name || "").toLowerCase()))
      : null;
    const initialLocation = preferredArea || result.recommendation?.bestLocation || result.opportunityAreas?.[0] || null;
    setSelectedDecisionLocation(initialLocation ? {
      coordinates: initialLocation.coordinates,
      address: initialLocation.address || initialLocation.name || result.recommendation?.bestArea,
      districtId: initialLocation.name || initialLocation.district || result.recommendation?.bestArea
    } : null);
  }, [result]);

  useEffect(() => {
    let active = true;
    setResult(null);
    setHistory([]);
    setChatMessages([]);
    setPlanModal(null);
    if (accessStatus !== "ready") return;
    loadLastAnalysis(session?.user).then((stored) => {
      if (!active || !stored?.result) return;
      setResult(stored.result);
      const input = stored.result.input || {};
      setForm((current) => ({
        ...current,
        country: String(input.country || current.country || "Kazakhstan"),
        city: String(input.city || ""),
        budget: input.budget == null ? "" : String(input.budget),
        businessType: String(input.businessType || ""),
        preferredLocation: String(input.preferredLocation || ""),
        targetAudience: String(input.targetAudience || ""),
        businessFormat: String(input.businessFormat || "")
      }));
    });
    return () => { active = false; analysisAbortRef.current?.abort(); };
  }, [session?.user?.id, accessStatus, access.plan, access.role]);

  useEffect(() => {
    let active = true;

    async function hydrateSystemState() {
      try {
        const systemState = await loadSystemState();

        if (active) {
          setDatabase(systemState.database);
          setOptions(systemState.options);
          setStatus("online");
        }
      } catch {
        if (active) {
          setStatus("offline");
        }
      }
    }

    hydrateSystemState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session?.user && can("MULTIPLE_PROJECTS")) {
      loadHistory();
    }
  }, [session?.user?.id, access.plan, access.role]);

  useEffect(() => {
    if (can("PLANNED_BUSINESS") && result?.input?.city && result?.input?.businessType) {
      loadPlannedBusinessState();
    } else {
      setPlannedBusinesses([]);
      setMyPlannedBusinesses([]);
    }
  }, [result?.input?.city, result?.input?.businessType, session?.user?.id, access.plan, access.role]);

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  async function runAnalysis() {
    if (!isFormComplete) {
      setError("Select a city, choose a business type, and enter a startup budget greater than 0 before running analysis.");
      return;
    }

    setAnalysisPhase(result ? "refresh" : "initial");
    setError("");
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;

    try {
      const data = await requestAnalysis({ form, session, signal: controller.signal });
      setResult(data);
      setPlannedBusinesses(data.plannedBusinesses || []);
      saveLastAnalysis(data);
      setStatus("online");

      if (session?.user && can("MULTIPLE_PROJECTS")) {
        loadHistory();
      }
    } catch (requestError) {
      if (requestError.name === "AbortError") {
        return;
      }
      setStatus(requestError.isApiResponse && requestError.status < 500 ? "online" : "offline");
      setError(requestError.message || "Could not run analysis.");
    } finally {
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null;
        setAnalysisPhase("idle");
      }
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      await submitAuthRequest({ mode: authMode, authForm });
      await refreshAccess();
      setAuthForm({ email: "", password: "", name: "", company: "" });
    } catch (authRequestError) {
      setAuthError(authRequestError.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadHistory() {
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    setHistoryLoading(true);

    try {
      const analyses = await loadSavedAnalyses();

      if (historyRequestRef.current === requestId) {
        setHistory(analyses);
      }
    } catch {
      if (historyRequestRef.current === requestId) {
        setHistory([]);
      }
    } finally {
      if (historyRequestRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }

  async function loadPlannedBusinessState() {
    if (!result?.input?.city || !result?.input?.businessType) {
      return;
    }

    const records = await loadPlannedBusinesses({
      city: result.input.city,
      category: result.input.businessType,
      session
    });
    setPlannedBusinesses(records);

    if (session?.user) {
      const owned = await loadPlannedBusinesses({ mine: true, session });
      setMyPlannedBusinesses(owned);
    } else {
      setMyPlannedBusinesses([]);
    }
  }

  function openPlanModal(location) {
    if (!result || !can("PLANNED_BUSINESS")) {
      return;
    }

    const bestLocation = result.recommendation?.bestLocation || result.opportunityAreas?.[0] || {};
    const selectedLocation = location || {
      coordinates: bestLocation.coordinates,
      address: bestLocation.address || bestLocation.name || result.recommendation?.bestArea,
      districtId: bestLocation.name || result.recommendation?.bestArea
    };

    if (!selectedLocation?.coordinates?.lat || !selectedLocation?.coordinates?.lng) {
      setPlanStatus("Select a mapped location with coordinates before confirming a plan.");
      return;
    }

    setPlanForm({
      businessName: "",
      budget: result.input?.budget ? String(result.input.budget) : "",
      businessFormat: ""
    });
    setPlanStatus("");
    setPlanModal({
      propertyId: selectedLocation.propertyId || null,
      category: result.input.businessType,
      city: result.input.city,
      address: selectedLocation.address || selectedLocation.districtId || "Selected map point",
      districtId: selectedLocation.districtId || selectedLocation.address || result.recommendation?.bestArea,
      coordinates: selectedLocation.coordinates
    });
  }

  async function submitPlannedBusiness(event) {
    event.preventDefault();
    if (!planModal) return;

    if (!session?.user || !can("PLANNED_BUSINESS")) {
      setPlanStatus("Sign in before adding planned businesses to the market model.");
      return;
    }

    setPlanLoading(true);
    setPlanStatus("");

    try {
      const created = await createPlannedBusiness({
        session,
        plan: {
          businessName: planForm.businessName,
          category: planModal.category,
          city: planModal.city,
          latitude: planModal.coordinates.lat,
          longitude: planModal.coordinates.lng,
          address: planModal.address,
          districtId: planModal.districtId,
          propertyId: planModal.propertyId,
          budget: planForm.budget,
          businessFormat: planForm.businessFormat
        }
      });
      setPlanStatus("Business plan added successfully. Rerun analysis to update projected market pressure.");
      setPlannedBusinesses((current) => [created.plannedBusiness, ...current]);
      setMyPlannedBusinesses((current) => [created.plannedBusiness, ...current]);
      setPlanModal(null);
    } catch (planError) {
      setPlanStatus(planError.message || "Could not add planned business.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function cancelPlan(id) {
    if (!session?.user || !can("PLANNED_BUSINESS")) {
      setPlanStatus("Sign in to manage planned businesses.");
      return;
    }

    try {
      await cancelPlannedBusiness({ id, session });
      setPlannedBusinesses((current) => current.filter((item) => item.id !== id));
      setMyPlannedBusinesses((current) => current.filter((item) => item.id !== id));
      setPlanStatus("Planned business cancelled.");
    } catch (planError) {
      setPlanStatus(planError.message || "Could not cancel planned business.");
    }
  }

  async function submitPropertyListing(event) {
    event.preventDefault();
    if (!session?.user || !can("COMMERCIAL_PROPERTIES")) {
      setPropertySubmitStatus("Sign in to submit a commercial property.");
      return;
    }
    setPropertySubmitStatus("");
    try {
      await submitProperty({ session, property: { ...propertyForm, city: result.input.city } });
      setPropertySubmitStatus("Listing submitted for moderation. It will appear after verification.");
      setPropertyForm({ title: "", propertyType: "", transactionType: "RENT", price: "", areaSqm: "", address: "", latitude: "", longitude: "", sourceUrl: "", contactPhone: "", contactEmail: "" });
      setPropertySubmissionOpen(false);
    } catch (propertyError) {
      setPropertySubmitStatus(propertyError.message || "Could not submit listing.");
    }
  }

  async function logout() {
    await signOut();
    historyRequestRef.current += 1;
    setHistory([]);
    setHistoryLoading(false);
  }

  async function sendConsultantMessage(rawContent) {
    const content = String(rawContent || "").trim();

    if (!content || chatBusyRef.current || !can("AI_ADVISOR")) {
      return;
    }

    const userMessage = { id: createMessageId("user"), role: "user", content };
    const assistantMessage = { id: createMessageId("assistant"), role: "assistant", content: "", intelligence: null };
    const outboundMessages = [...chatMessages, userMessage].slice(-12);

    chatBusyRef.current = true;
    setChatLoading(true);
    setChatMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const response = await streamChatRequest({
        messages: outboundMessages,
        analysis: result ? compactAnalysisForChat({ ...result, selectedDecisionContext: selectedDecisionLocation }) : null,
        analysisId: result?.analysisId || null,
        language,
        session,
        selectedDistrict: selectedDecisionLocation?.districtId || null,
        discoveryContext: discoveryContextRef.current
      });

      if (!response.ok || !response.body) {
        throw new Error("Streaming chat failed");
      }

      await readSseStream(response, (payload) => {
        if (payload.delta) {
          setChatMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id ? { ...message, content: `${message.content}${payload.delta}` } : message
            )
          );
        } else if (payload.done && payload.meta) {
          setChatMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id ? { ...message, intelligence: extractConsultantIntelligence(payload.meta) } : message
            )
          );
        } else if (payload.error) {
          throw new Error(payload.error);
        }
      });
    } catch (chatError) {
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: chatError.message || "Gemini could not respond. Check the API connection and try again." }
            : message
        )
      );
    } finally {
      chatBusyRef.current = false;
      setChatLoading(false);
    }
  }

  function submitConsultantQuestion(event) {
    event.preventDefault();
    const content = chatInput.trim();

    if (!content || chatLoading) {
      return;
    }

    setChatInput("");
    sendConsultantMessage(content);
  }

  async function exportReport({ print = false } = {}) {
    if (!result || !can("EXPORT")) {
      return;
    }

    if (print) {
      const reportHtml = await buildExportHtmlReport({ result, language });

      if (!reportHtml) {
        return;
      }

      const reportWindow = window.open("", "_blank", "noopener,noreferrer");

      if (reportWindow) {
        reportWindow.document.write(reportHtml);
        reportWindow.document.close();
        reportWindow.focus();
        window.setTimeout(() => reportWindow.print(), 300);
      } else {
        downloadBlob(reportHtml, "mercora-opportunity-report.html", "text/html");
      }
      return;
    }

    const report = await buildExportReport({ result, language });

    if (!report) {
      return;
    }

    const reportHtml = report.html || report.printHtml || "";

    if (!reportHtml) {
      return;
    }

    downloadBlob(reportHtml, report.filename || "mercora-opportunity-report.html", "text/html");
  }

  function exportJson() {
    if (!result || !can("EXPORT")) {
      return;
    }

    downloadBlob(JSON.stringify(result, null, 2), "mercora-analysis.json", "application/json");
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
    setResult(null);
    setChatMessages([]);
    setCompetitorQuery("");
    setPriceQuery("");
    setError("");
    analysisAbortRef.current?.abort();
  }

  return (
    <main className="appShell">
      <section className="topbar">
        <div className="brandCluster">
          <div>
            <strong>{t.appName}</strong>
            <span>{t.subtitle}</span>
          </div>
        </div>

        <div className="topbarActions">
          <span className={`statusPill ${status}`}>{status === "online" ? t.online : status === "offline" ? t.offline : t.checking}</span>
          <div className="segmentedControl" aria-label="Language">
            {["en", "ru", "kk"].map((item) => (
              <button key={item} type="button" className={language === item ? "active" : ""} onClick={() => setLanguage(item)}>
                <Globe2 size={14} />
                {LANGUAGE_LABELS[item] || item.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="iconButton"
            title={theme === "dark" ? t.light : t.dark}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </section>

      <PlatformNav />

      <section className="commandCenter">
        <motion.article className="glassPanel controlPanel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Market query</span>
              <h1>{analysisHeading}</h1>
              {!form.city || !selectedBusinessLabel ? <p className="welcomeCopy">{t.welcomeBody}</p> : null}
            </div>
            <button type="button" className="iconButton" title={t.refresh} onClick={() => runAnalysis()} disabled={analysisBusy || !isFormComplete}>
              <RefreshCw size={18} className={analysisBusy ? "spinIcon" : ""} />
            </button>
          </div>

          <form className="analysisForm" onSubmit={(event) => { event.preventDefault(); runAnalysis(); }}>
            <label>
              <span>Business type</span>
              <select value={form.businessType} onChange={(event) => updateField("businessType", event.target.value)}>
                <option value="">Select business type</option>
                {options.businessTypes.map((type) => (
                  <option key={type} value={type}>{formatBusinessType(type, options.profiles)}</option>
                ))}
              </select>
            </label>

            <label>
              <span>{t.budget}</span>
              <input
                type="number"
                min="1"
                value={form.budget}
                placeholder="0"
                onChange={(event) => updateField("budget", event.target.value)}
                aria-invalid={Boolean(form.budget) && !isBudgetValid}
              />
            </label>

            <label>
              <span>{t.city}</span>
              <select value={form.city} onChange={(event) => updateField("city", event.target.value)}>
                <option value="">Select city</option>
                {options.cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </label>

            <details className="analysisOptionalFields">
              <summary>Optional decision context</summary>
              <div>
                <label>
                  <span>Preferred location</span>
                  <input value={form.preferredLocation} onChange={(event) => updateField("preferredLocation", event.target.value)} placeholder="District or address" />
                </label>
                <label>
                  <span>Target audience</span>
                  <input value={form.targetAudience} onChange={(event) => updateField("targetAudience", event.target.value)} placeholder="e.g. office workers" />
                </label>
                <label>
                  <span>Business format</span>
                  <input value={form.businessFormat} onChange={(event) => updateField("businessFormat", event.target.value)} placeholder="kiosk, branch, premium" />
                </label>
              </div>
            </details>

            {selectedProfile && result ? <p className="sourceText">{selectedProfile.priceMeaning}</p> : null}

            <button type="submit" className="primaryButton" disabled={analysisBusy || !isFormComplete}>
              {!analysisBusy ? <Search size={17} /> : null}
              {analysisBusy ? ANALYSIS_LOADING_STAGES[loadingStageIndex] : "Analyze Opportunity"}
            </button>
          </form>

          <div className="systemStrip">
            <span>Data {options.dataVersion}</span>
            <span>{database?.mode || "memory"} storage</span>
          </div>
          {!result ? <p className="welcomeHint">{t.welcomeHint}</p> : null}
          {error && result ? (
            <ErrorState
              title={status === "offline" ? t.analysisUnavailable : t.analysisDidNotComplete}
              body={error}
              onRetry={() => runAnalysis()}
              className="inlineState"
            />
          ) : null}
        </motion.article>

        <motion.article id="account" className="glassPanel authPanel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          {session?.user ? (
            <>
              <div className="userCard">
                <div className="avatar"><User size={18} /></div>
                <div>
                  <strong>{session.user.name}</strong>
                  <span>{session.user.email}</span>
                </div>
                <button type="button" className="iconButton" title={t.logout} onClick={logout}><LogOut size={17} /></button>
              </div>

              {can("MULTIPLE_PROJECTS") ? <div className="historyList">
                <div className="panelHeader compact">
                  <h2>{t.saved}</h2>
                  <History size={16} />
                </div>
                {historyLoading && !history.length ? (
                  <div className="historySkeletonList" aria-label="Loading saved analyses">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <span className="historySkeletonItem" key={`history-skeleton-${index}`} />
                    ))}
                  </div>
                ) : history.length ? history.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="historyItem"
                    onClick={() => {
                      const restored = { ...item.result, analysisId: item.id, account: { user: session.user } };
                      setResult(restored);
                      saveLastAnalysis(restored);
                      setForm({
                        country: item.input.country || "Kazakhstan",
                        city: item.input.city,
                        budget: String(item.input.budget),
                        businessType: item.input.businessType,
                        preferredLocation: item.input.preferredLocation || "",
                        targetAudience: item.input.targetAudience || "",
                        businessFormat: item.input.businessFormat || ""
                      });
                    }}
                  >
                    <span>{item.city} - {formatBusinessType(item.businessType, options.profiles)}</span>
                    <strong>{item.result?.opportunityScore?.score != null ? `${item.result.opportunityScore.score}/100` : "n/a"}</strong>
                  </button>
                )) : (
                  <EmptyState
                    icon={History}
                    title={t.noSavedAnalyses}
                    body={t.savedAnalysesHint}
                    className="inlineEmptyState"
                  />
                )}
              </div> : <AccessGate compact feature="MULTIPLE_PROJECTS" />}
            </>
          ) : (
            <>
              <div className="panelHeader compact">
                <div>
                  <span className="eyebrow">{t.account}</span>
                  <h2>{authMode === "login" ? t.login : t.register}</h2>
                </div>
                <Lock size={17} />
              </div>
              <form className="authForm" onSubmit={submitAuth}>
                {authMode === "register" ? (
                  <>
                    <input value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} placeholder={t.name} />
                    <input value={authForm.company} onChange={(event) => setAuthForm((current) => ({ ...current, company: event.target.value }))} placeholder={t.company} />
                  </>
                ) : null}
                <input type="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} placeholder={t.email} />
                <input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder={t.password} />
                <button type="submit" className="secondaryButton" disabled={authLoading}>
                  {authLoading ? t.working : authMode === "login" ? t.login : t.register}
                </button>
              </form>
              <button type="button" className="textButton" onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}>
                {authMode === "login" ? t.register : t.login}
              </button>
              <p className="sourceText">{t.authHint}</p>
              {authError ? <p className="errorText">{authError}</p> : null}
            </>
          )}
        </motion.article>

        <section className="summaryRail">
          {summaryCards.map((card, index) => (
            <motion.article
              className={`metricCard ${result ? "" : "inactiveMetric"}`}
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <card.icon size={18} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </motion.article>
          ))}
        </section>
      </section>

      <AnimatePresence>
        {analysisBusy ? (
          <motion.section className="loadingBanner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="spinner" />
            <div>
              <strong>{ANALYSIS_LOADING_STAGES[loadingStageIndex]}</strong>
              <p>TezTap is processing observed sources and calculated analytics. Results remain unavailable until the request completes.</p>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {!result ? (
        <motion.section
          id="mercora-ai"
          className="glassPanel standaloneAssistantSection"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div className="standaloneAssistantHeader">
            <div className="consultantAvatar"><BrainCircuit size={20} /></div>
            <div>
              <span className="eyebrow">TezTap AI · Gemini</span>
              <h2>Спросите ИИ прямо сейчас</h2>
              <p>Опишите задачу обычными словами. Для вопроса о бизнесе можно сначала запустить полный анализ выше.</p>
            </div>
          </div>
          <AccessGate feature="AI_ADVISOR" compact>
            <div className="standaloneAssistantBody">
              <div className="chatWindow premiumChatWindow" ref={chatWindowRef}>
                <AnimatePresence initial={false}>
                  {chatMessages.length ? chatMessages.map((message, index) => (
                    <motion.div
                      className={`chatBubble ${message.role}`}
                      key={message.id || `${message.role}-${index}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <span>{message.role === "user" ? "Вы" : "TezTap AI"}</span>
                      <MarkdownContent content={message.content || (message.role === "assistant" ? "Анализирую запрос…" : "")} streaming={message.role === "assistant" && chatLoading && !message.intelligence} />
                    </motion.div>
                  )) : (
                    <motion.div className="chatBubble assistant openingBubble" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <span>TezTap AI</span>
                      <MarkdownContent content="Я готов. Спросите о бизнесе, работе, образовании, услугах, товарах или местах в Актау." />
                    </motion.div>
                  )}
                  {chatLoading ? (
                    <motion.div className="chatBubble assistant typingBubble" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <span>TezTap анализирует</span><p><i /> <i /> <i /></p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="consultantSuggestions" aria-label="Примеры вопросов">
                {["Найди подходящий учебный центр в Актау", "Какие вакансии подходят начинающему?", "Где открыть небольшой бизнес?"].map((question) => (
                  <button type="button" key={question} onClick={() => setChatInput(question)} disabled={chatLoading}>{question}</button>
                ))}
              </div>
              <form className="chatComposer premiumChatComposer" onSubmit={submitConsultantQuestion}>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Напишите запрос для TezTap AI…"
                  aria-label="Запрос для TezTap AI"
                  disabled={chatLoading}
                />
                <button type="submit" className="secondaryButton" disabled={chatLoading || !chatInput.trim()}>
                  <Send size={16} /> Отправить
                </button>
                <p className="sourceText">Если вы пришли из другого раздела, TezTap использует переданные карточки и параметры поиска как контекст.</p>
              </form>
            </div>
          </AccessGate>
        </motion.section>
      ) : null}

      <AnimatePresence mode="wait">
        {result && can("OPPORTUNITY_SCORE") && result.opportunityScore ? (
        <motion.section
          key="dashboard"
          className={`dashboardGrid decisionFirstDashboard ${fullAnalysisOpen ? "showAdvanced" : ""} ${isRefreshingAnalysis ? "isRefreshing" : ""}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          <DecisionOverview
            result={result}
            selectedLocation={selectedDecisionLocation}
            whyScoreOpen={whyScoreOpen}
            onToggleWhy={() => setWhyScoreOpen((value) => !value)}
            onSelectLocation={setSelectedDecisionLocation}
          />

          {can("FORECASTING") && <InvestorConsole result={result} liveAnalytics={liveAnalytics} />}

          {result.investorDecision ? (
          <DashboardSection className="wideSection investorDecisionSection" icon={ShieldCheck} title="Investor decision center" narrative={result.aiNarratives.investor}>
            <div className="decisionGrid">
              <article className="decisionMemo">
                <span>Decision memo</span>
                <strong>{result.investorDecision.investmentMemo.verdict}</strong>
                <p>{result.investorDecision.investmentMemo.thesis}</p>
                <dl>
                  <div>
                    <dt>Why now</dt>
                    <dd>{result.investorDecision.investmentMemo.whyNow}</dd>
                  </div>
                  <div>
                    <dt>Key risk</dt>
                    <dd>{result.investorDecision.investmentMemo.keyRisk}</dd>
                  </div>
                  <div>
                    <dt>Mitigation</dt>
                    <dd>{result.investorDecision.investmentMemo.mitigation}</dd>
                  </div>
                </dl>
              </article>

              <article className="dataRoomCard">
                <div className="dataRoomScore">
                  <Gauge size={19} />
                  <div>
                    <strong>{result.investorDecision.dataRoom.score}/100</strong>
                    <span>{result.investorDecision.dataRoom.label}</span>
                  </div>
                </div>
                <div className="checkList">
                  {result.investorDecision.dataRoom.checks?.length ? result.investorDecision.dataRoom.checks.map((check) => (
                    <div key={check.label}>
                      <span>{check.label}</span>
                      <strong>{check.status}</strong>
                      <small>{check.value}</small>
                    </div>
                  )) : <p className="sourceText">No data-room checks were returned.</p>}
                </div>
              </article>
            </div>

            <div className="boardMetricGrid">
              {result.investorDecision.boardMetrics?.length ? result.investorDecision.boardMetrics.map((metric) => (
                <Kpi key={metric.label} label={metric.label} value={formatBoardMetric(metric)} />
              )) : (
                <EmptyState title="No board metrics" body="The analysis did not return board-level metrics." className="gridEmptyState" />
              )}
            </div>

            <div className="scenarioGrid">
              {result.investorDecision.scenarios?.length ? result.investorDecision.scenarios.map((scenario) => (
                <article className="scenarioCard" key={scenario.name}>
                  <div>
                    <span>{scenario.name}</span>
                    <strong>{scenario.status}</strong>
                  </div>
                  <p>{scenario.description}</p>
                  <dl>
                    <div><dt>Revenue</dt><dd>{formatMoney(scenario.revenue)} KZT</dd></div>
                    <div><dt>Net profit</dt><dd>{formatMoney(scenario.netProfit)} KZT</dd></div>
                    <div><dt>Break-even</dt><dd>{formatMoney(scenario.breakEvenTransactions)} sales/mo</dd></div>
                    <div><dt>Margin</dt><dd>{scenario.marginPercent}%</dd></div>
                  </dl>
                </article>
              )) : (
                <EmptyState title="No base economics" body="The analysis did not return enough price evidence to calculate revenue, profit, and break-even." className="gridEmptyState" />
              )}
            </div>
          </DashboardSection>
          ) : null}

          <div id="mercora-ai" className="assistantAnchor" />
          <DashboardSection className="assistantSection premiumAssistantSection primaryDecisionSection orderAssistant" icon={BrainCircuit} title={t.assistant} narrative={result.aiNarratives.assistant}>
            <AccessGate feature="AI_ADVISOR" compact>
            <div className="consultantHeader premiumConsultantHeader">
              <div className="consultantIdentity">
                <div className="consultantAvatar">
                  <BrainCircuit size={19} />
                </div>
                <div>
                  <span>{t.assistantIdentity}</span>
                  <strong>{t.assistantGrounding}</strong>
                </div>
              </div>
              <small>{session?.user ? t.memoryLinked : t.sessionScoped} - {t.streaming}</small>
            </div>

            <div className="consultantWorkspace">
              <aside className="consultantSideRail">
            <div className="consultantIntelGrid premiumIntelGrid">
              <article>
                <BadgeCheck size={16} />
                <span>{t.opportunity}</span>
                <strong>{result.opportunityScore.score}/100</strong>
              </article>
              <article>
                <Calculator size={16} />
                <span>{t.successModel}</span>
                <strong>{result.probability.successProbability}%</strong>
              </article>
              <article>
                <MapPinned size={16} />
                <span>{t.recommendedDistrict}</span>
                <strong>{result.recommendation.bestArea || "n/a"}</strong>
              </article>
              <article>
                <Building2 size={16} />
                <span>{t.marketEvidence}</span>
                <strong>{result.market.competitorCount} {t.competitorsShort} / {result.stats.sampleCount} {t.pricesShort}</strong>
              </article>
            </div>

            <div className="consultantGroundingCard">
              <strong>{t.aiGroundedTitle}</strong>
              <p>{t.aiGroundedBody}</p>
            </div>
              </aside>
              <section className="consultantConversationPane">
            <div className="chatWindow premiumChatWindow" ref={chatWindowRef}>
              <AnimatePresence initial={false}>
              {chatMessages.length ? chatMessages.map((message, index) => (
                <motion.div
                  className={`chatBubble ${message.role}`}
                  key={message.id || `${message.role}-${index}`}
                  initial={{ opacity: 0, y: 12, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <span>{message.role === "user" ? t.you : t.consultant}</span>
                  <MarkdownContent content={message.content || (message.role === "assistant" ? t.analyzingLiveMetrics : "")} streaming={message.role === "assistant" && chatLoading && !message.intelligence} />
                </motion.div>
              )) : (
                <motion.div className="chatBubble assistant openingBubble" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <span>{t.consultant}</span>
                  <MarkdownContent content={buildConsultantOpening(result)} />
                </motion.div>
              )}
              {chatLoading ? (
                <motion.div className="chatBubble assistant typingBubble" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span>{t.consultantReading}</span>
                  <p><i /> <i /> <i /></p>
                </motion.div>
              ) : null}
              </AnimatePresence>
            </div>
            <div className="consultantSuggestions" aria-label="Suggested questions">
              {[
                `Why is ${selectedDecisionLocation?.districtId || result.recommendation.bestArea || "this location"} recommended?`,
                "What are the biggest risks?",
                "What changes if my budget increases?"
              ].map((question) => (
                <button type="button" key={question} onClick={() => setChatInput(question)} disabled={chatLoading}>
                  {question}
                </button>
              ))}
            </div>
            <form className="chatComposer premiumChatComposer" onSubmit={submitConsultantQuestion}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={t.askConsultantPlaceholder}
                disabled={chatLoading}
              />
              <button type="submit" className="secondaryButton" disabled={chatLoading || !chatInput.trim()}>
                <Send size={16} />
                {t.send}
              </button>
              <p className="sourceText">{t.aiGroundedComposerHint}</p>
            </form>
              </section>
            </div>
            </AccessGate>
          </DashboardSection>

          {result.marketGapEngine ? (
          <DashboardSection className="wideSection marketGapEngineSection" icon={Target} title="Market Gap Engine" narrative={result.marketGapEngine.summary?.plainEnglish || "Dedicated market gap analysis combining missing categories, pricing gaps, weak coverage, unmet demand, and BOI scoring."}>
            <div className="marketGapHero">
              <div className="boiScoreDial" style={{ "--score": result.marketGapEngine.boi?.score ?? 0 }}>
                <span>BOI Score</span>
                <strong>{result.marketGapEngine.boi?.score ?? 0}</strong>
                <small>{result.marketGapEngine.boi?.label || "Not available"}</small>
              </div>
              <div className="boiDriverPanel">
                <div className="panelSubheader">
                  <span>Business Opportunity Index</span>
                  <strong>{result.marketGapEngine.boi?.decisionRule || "Validation required"}</strong>
                </div>
                {(result.marketGapEngine.visualization?.driverBars || []).map((driver) => (
                  <FactorBar key={driver.driver} label={`${formatFactorName(driver.driver)} (${Math.round(driver.weight * 100)}%)`} value={driver.score} />
                ))}
              </div>
            </div>

            <div className="gapSignalGrid">
              {(result.marketGapEngine.headlineSignals || []).slice(0, 4).map((signal) => (
                <article key={`${signal.type}-${signal.statement}`}>
                  <span>{formatFactorName(signal.type)}</span>
                  <strong>{signal.statement}</strong>
                  <p>{signal.evidence}</p>
                  <small>{signal.score}/100 signal</small>
                </article>
              ))}
            </div>

            <div className="gapDetectionSplit">
              <article>
                <span>Gap detection strength</span>
                {(result.marketGapEngine.visualization?.detectionBars || []).map((item) => (
                  <FactorBar key={item.label} label={item.label} value={item.score} />
                ))}
              </article>
              <article>
                <span>Strategic advisor</span>
                <strong>{result.marketGapEngine.strategicAdvisor?.stance === "challenge_or_pivot" ? "Challenge or pivot" : "Support with validation"}</strong>
                <p>{result.marketGapEngine.strategicAdvisor?.challenge}</p>
                <small>{result.marketGapEngine.strategicAdvisor?.comparison?.advisorRead}</small>
              </article>
            </div>

            <div className="opportunityThesisGrid">
              {(result.marketGapEngine.opportunityTheses || []).slice(0, 4).map((thesis) => (
                <article key={`${thesis.rank}-${thesis.thesis}`}>
                  <span>Thesis #{thesis.rank}</span>
                  <strong>{thesis.thesis}</strong>
                  <p>{thesis.evidence}</p>
                  <small>{thesis.recommendedMove}</small>
                </article>
              ))}
            </div>
          </DashboardSection>
          ) : null}

          <DashboardSection icon={Building2} title={t.overview} narrative={result.aiNarratives.overview}>
            <div className="liveCommandStrip">
              {liveAnalytics.map((item) => (
                <article className={`liveSignal ${item.tone}`} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <div className="overviewGrid">
              <Kpi label="Competitors" value={result.market.competitorCount} />
              <Kpi label="Price samples" value={result.stats.sampleCount} />
              <Kpi label="Average price" value={result.stats.sampleCount ? `${formatMoney(result.stats.avgPrice)} KZT` : "n/a"} />
              {can("FORECASTING") && <Kpi label="Break-even" value={result.budgetPlan.breakEvenTransactions != null ? `${formatMoney(result.budgetPlan.breakEvenTransactions)} sales/mo` : "n/a"} />}
              {can("FORECASTING") && <Kpi label="Runway" value={result.budgetPlan.runwayMonths == null ? "n/a" : `${result.budgetPlan.runwayMonths} mo`} />}
              <Kpi label="Market signal" value={result.analytics.marketSignal} />
            </div>
          </DashboardSection>

          {result.ecosystemWorkflows ? (
            <DashboardSection className="wideSection ecosystemWorkflowSection" icon={Globe2} title="Geo-economic intelligence workflows" narrative="TezTap supports opportunity discovery and expansion decisions for entrepreneurs, franchise operators, investors, lenders, consultants, and public-sector economic development teams.">
              <div className="ecosystemIdentity">
                <strong>{result.ecosystemWorkflows.platformIdentity}</strong>
                <span>Analytics engine calculates. AI explains. Every workflow uses the current market analysis.</span>
              </div>
              <div className="ecosystemAudienceList">
                {(result.ecosystemWorkflows.audiences || []).map((audience) => <span key={audience}>{audience}</span>)}
              </div>
              <div className="workflowGrid">
                <article className="workflowCard">
                  <div>
                    <span>Workflow</span>
                    <strong>{result.ecosystemWorkflows.workflows?.entrepreneurs?.title}</strong>
                    <small>{result.ecosystemWorkflows.workflows?.entrepreneurs?.purpose}</small>
                  </div>
                  <WorkflowList title="Business ideas" items={result.ecosystemWorkflows.workflows?.entrepreneurs?.businessIdeas} getLabel={(item) => item.idea} getDetail={(item) => item.why} />
                  <WorkflowMetric label="Location selection" value={result.ecosystemWorkflows.workflows?.entrepreneurs?.locationSelection?.recommendedDistrict || "n/a"} detail={result.ecosystemWorkflows.workflows?.entrepreneurs?.locationSelection?.why} />
                  <WorkflowList title="Market opportunities" items={result.ecosystemWorkflows.workflows?.entrepreneurs?.marketOpportunities} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Workflow</span>
                    <strong>{result.ecosystemWorkflows.workflows?.franchises?.title}</strong>
                    <small>{result.ecosystemWorkflows.workflows?.franchises?.purpose}</small>
                  </div>
                  <WorkflowList title="New branch placement" items={result.ecosystemWorkflows.workflows?.franchises?.newBranchPlacement} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                  <WorkflowMetric label="Competitor monitoring" value={`${result.ecosystemWorkflows.workflows?.franchises?.competitorMonitoring?.competitorCount ?? 0} competitors`} detail={result.ecosystemWorkflows.workflows?.franchises?.competitorMonitoring?.why} />
                  <WorkflowMetric label="Market penetration" value={`${result.ecosystemWorkflows.workflows?.franchises?.marketPenetrationAnalysis?.priorityDistrictCount ?? 0} priority districts`} detail={result.ecosystemWorkflows.workflows?.franchises?.marketPenetrationAnalysis?.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Workflow</span>
                    <strong>{result.ecosystemWorkflows.workflows?.investors?.title}</strong>
                    <small>{result.ecosystemWorkflows.workflows?.investors?.purpose}</small>
                  </div>
                  <WorkflowMetric label="Investment opportunity" value={`${result.ecosystemWorkflows.workflows?.investors?.investmentOpportunityDiscovery?.investmentAttractiveness ?? 0}/100 attractiveness`} detail={result.ecosystemWorkflows.workflows?.investors?.investmentOpportunityDiscovery?.why} />
                  <WorkflowList title="District attractiveness" items={result.ecosystemWorkflows.workflows?.investors?.districtAttractiveness} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                  <WorkflowMetric label="Risk evaluation" value={`${result.ecosystemWorkflows.workflows?.investors?.riskEvaluation?.riskScore ?? 0}/100 risk`} detail={result.ecosystemWorkflows.workflows?.investors?.riskEvaluation?.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Workflow</span>
                    <strong>{result.ecosystemWorkflows.workflows?.banks?.title}</strong>
                    <small>{result.ecosystemWorkflows.workflows?.banks?.purpose}</small>
                  </div>
                  <WorkflowMetric label="Loan risk assessment" value={`${result.ecosystemWorkflows.workflows?.banks?.businessLoanRiskAssessment?.riskScore ?? 0}/100 risk`} detail={result.ecosystemWorkflows.workflows?.banks?.businessLoanRiskAssessment?.why} />
                  <WorkflowMetric label="Market viability" value={`${result.ecosystemWorkflows.workflows?.banks?.marketViabilityEvaluation?.successProbability ?? 0}% success`} detail={result.ecosystemWorkflows.workflows?.banks?.marketViabilityEvaluation?.why} />
                  <WorkflowList title="District intelligence" items={result.ecosystemWorkflows.workflows?.banks?.districtIntelligence} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Workflow</span>
                    <strong>{result.ecosystemWorkflows.workflows?.government?.title}</strong>
                    <small>{result.ecosystemWorkflows.workflows?.government?.purpose}</small>
                  </div>
                  <WorkflowList title="Underserved districts" items={result.ecosystemWorkflows.workflows?.government?.underservedDistricts} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                  <WorkflowList title="Market gaps" items={result.ecosystemWorkflows.workflows?.government?.marketGapAnalysis} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                  <WorkflowMetric label="SME support priorities" value={`${result.ecosystemWorkflows.workflows?.government?.smeSupportPriorities?.priorityDistrictCount ?? 0} priority districts`} detail={result.ecosystemWorkflows.workflows?.government?.smeSupportPriorities?.why} />
                </article>
              </div>
            </DashboardSection>
          ) : null}

          {result.cityEconomicIndicator ? (
            <DashboardSection className="wideSection cityIndicatorSection" icon={TrendingUp} title="City-wide economic indicator" narrative="A city-level economic signal calculated from business activity, competition density, investment attractiveness, entrepreneurship growth, and market diversity.">
              <div className="cityIndicatorHeader">
                <div>
                  <span>{result.cityEconomicIndicator.city}</span>
                  <strong>{result.cityEconomicIndicator.compositeScore}/100</strong>
                  <small>{result.cityEconomicIndicator.label}</small>
                </div>
                <p>{result.cityEconomicIndicator.why}</p>
              </div>
              <div className="cityIndicatorGrid">
                {Object.entries(result.cityEconomicIndicator.indicators || {}).map(([key, indicator]) => (
                  <article key={key}>
                    <span>{formatFactorName(key)}</span>
                    <strong>{indicator.score}/100</strong>
                    <small>{indicator.why}</small>
                  </article>
                ))}
              </div>
              <ChartCard title="Projected city trend" subtitle={result.cityEconomicIndicator.trendSeries?.explanation || "Projected trend from current analysis."}>
                <LineChart width={720} height={260} data={result.cityEconomicIndicator.trendSeries?.points || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip />
                  <Line type="monotone" dataKey="compositeScore" stroke={chartColors.primary} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="investmentAttractiveness" stroke={chartColors.success} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="entrepreneurshipGrowth" stroke={chartColors.warning} strokeWidth={2} dot={false} />
                </LineChart>
              </ChartCard>
            </DashboardSection>
          ) : null}

          {result.investmentModule ? (
            <DashboardSection className="wideSection investmentModuleSection" icon={BadgeCheck} title="Investment intelligence module" narrative="Dedicated investor workflow for discovering high-potential districts, emerging sectors, comparable opportunities, risks, and growth trends.">
              <div className="investmentThesis">
                <span>Investment thesis</span>
                <strong>{result.investmentModule.thesis?.investmentAttractiveness ?? 0}/100 attractiveness</strong>
                <p>{result.investmentModule.thesis?.why || "No investment thesis explanation returned."}</p>
              </div>
              <div className="workflowGrid">
                <article className="workflowCard">
                  <div>
                    <span>Investor view</span>
                    <strong>High-potential districts</strong>
                  </div>
                  <WorkflowList title="Districts" items={result.investmentModule.highPotentialDistricts} getLabel={(item) => item.district} getDetail={(item) => item.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Investor view</span>
                    <strong>Emerging sectors</strong>
                  </div>
                  <WorkflowList title="Sectors" items={result.investmentModule.emergingSectors} getLabel={(item) => item.sector} getDetail={(item) => item.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Investor view</span>
                    <strong>Investment opportunities</strong>
                  </div>
                  <WorkflowList title="Opportunities" items={result.investmentModule.investmentOpportunities} getLabel={(item) => `${item.category} / ${item.district}`} getDetail={(item) => item.why} />
                </article>
                <article className="workflowCard">
                  <div>
                    <span>Investor view</span>
                    <strong>Risk and growth</strong>
                  </div>
                  <WorkflowMetric label="Risk assessment" value={`${result.investmentModule.riskAssessment?.riskScore ?? 0}/100 risk`} detail={result.investmentModule.riskAssessment?.why} />
                  <WorkflowMetric label="Growth trends" value={result.investmentModule.growthTrends?.cityTrendType || "projected"} detail={result.investmentModule.growthTrends?.why} />
                </article>
              </div>
            </DashboardSection>
          ) : null}

          <DashboardSection className="wideSection primaryDecisionSection orderMap" icon={MapIcon} title={t.map} narrative={result.aiNarratives.map}>
            <div className="mapActionBar">
              <div>
                <strong>{selectedDecisionLocation?.districtId || result.recommendation?.bestArea || "Recommended location"}</strong>
                <span>Select a district on the map, review its evidence, then confirm your action.</span>
              </div>
              {can("PLANNED_BUSINESS") && <button type="button" className="secondaryButton" onClick={() => openPlanModal(selectedDecisionLocation)}>
                <MapPinned size={17} />
                I Plan to Open Here
              </button>}
            </div>
            <CompetitorLeafletMap
              result={result}
              plannedBusinesses={plannedBusinesses}
              properties={filteredProperties}
              selectedLocation={selectedDecisionLocation}
              onLocationSelect={setSelectedDecisionLocation}
            />
          </DashboardSection>

          <DashboardSection feature="COMMERCIAL_PROPERTIES" className="wideSection propertyMarketplaceSection primaryDecisionSection orderProperty" icon={Building2} title="Available Commercial Spaces Nearby" narrative={`Only active or verified listings near ${selectedDecisionLocation?.districtId || result.recommendation?.bestArea || "the selected location"} are shown. Fit comes from the current analysis and supplied budget.`}>
            <div className="propertyToolbar">
              <button type="button" className="secondaryButton" onClick={() => setPropertySubmissionOpen((value) => !value)}>{propertySubmissionOpen ? "Close listing form" : "List a commercial space"}</button>
              <div className="propertyFilterGroup">
                {[["ALL", "All"], ["RENT", "Rent"], ["SALE", "Sale"]].map(([value, label]) => (
                  <button type="button" className={propertyTransactionFilter === value ? "active" : ""} key={value} onClick={() => setPropertyTransactionFilter(value)}>{label}</button>
                ))}
              </div>
              <select value={propertyTypeFilter} onChange={(event) => setPropertyTypeFilter(event.target.value)} aria-label="Property type">
                <option value="ALL">All property types</option>
                {propertyTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
              <input type="number" min="0" value={propertyMaxPrice} onChange={(event) => setPropertyMaxPrice(event.target.value)} placeholder="Max price" aria-label="Maximum property price" />
              <input type="number" min="0" value={propertyMinArea} onChange={(event) => setPropertyMinArea(event.target.value)} placeholder="Min m²" aria-label="Minimum property area" />
              <input type="number" min="0" step="0.1" value={propertyMaxDistance} onChange={(event) => setPropertyMaxDistance(event.target.value)} placeholder="Max km" aria-label="Maximum distance" />
            </div>
            {propertySubmissionOpen ? (
              <form className="propertySubmissionForm" onSubmit={submitPropertyListing}>
                <div className="formGrid">
                  <input required value={propertyForm.title} onChange={(event) => setPropertyForm((current) => ({ ...current, title: event.target.value }))} placeholder="Listing title" />
                  <input required value={propertyForm.propertyType} onChange={(event) => setPropertyForm((current) => ({ ...current, propertyType: event.target.value }))} placeholder="Property type" />
                  <select value={propertyForm.transactionType} onChange={(event) => setPropertyForm((current) => ({ ...current, transactionType: event.target.value }))}><option value="RENT">Rent</option><option value="SALE">Sale</option></select>
                  <input required type="number" min="0" value={propertyForm.price} onChange={(event) => setPropertyForm((current) => ({ ...current, price: event.target.value }))} placeholder="Price in KZT" />
                  <input required type="number" min="1" value={propertyForm.areaSqm} onChange={(event) => setPropertyForm((current) => ({ ...current, areaSqm: event.target.value }))} placeholder="Area m²" />
                  <input required value={propertyForm.address} onChange={(event) => setPropertyForm((current) => ({ ...current, address: event.target.value }))} placeholder="Exact address" />
                  <input required type="number" step="any" value={propertyForm.latitude} onChange={(event) => setPropertyForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" />
                  <input required type="number" step="any" value={propertyForm.longitude} onChange={(event) => setPropertyForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" />
                  <input value={propertyForm.sourceUrl} onChange={(event) => setPropertyForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="Source URL" />
                  <input value={propertyForm.contactPhone} onChange={(event) => setPropertyForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="Phone (private)" />
                  <input value={propertyForm.contactEmail} onChange={(event) => setPropertyForm((current) => ({ ...current, contactEmail: event.target.value }))} placeholder="Email (private)" />
                </div>
                <p className="sourceText">Listings are stored as PENDING and are not visible in recommendations until verified. Contact details are private.</p>
                {propertySubmitStatus ? <p className="statusNote">{propertySubmitStatus}</p> : null}
                <button type="submit" className="primaryButton">Submit for moderation</button>
              </form>
            ) : null}
            {filteredProperties.length ? (
              <div className="propertyMarketplaceGrid">
                {filteredProperties.slice(0, 12).map((property) => (
                  <article className="propertyListingCard" key={property.id}>
                    <div className="propertyListingMedia">
                      {property.photos?.[0] ? (
                        <img src={property.photos[0]} alt={property.title} loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div aria-label="No property photo available"><Building2 size={26} /></div>
                      )}
                      <span>{property.transactionType === "RENT" ? "For rent" : "For sale"}</span>
                    </div>
                    <div className="propertyListingHeader">
                      <span>{property.propertyType || "Commercial space"}</span>
                      <strong>{property.propertyFitScore}/100 fit</strong>
                    </div>
                    <h3>{property.title}</h3>
                    <p>{property.address}</p>
                    <dl>
                      <div><dt>Price</dt><dd>{formatMoney(property.price)} {property.currency}{property.transactionType === "RENT" ? "/ month" : ""}</dd></div>
                      <div><dt>Area</dt><dd>{property.areaSqm} m²</dd></div>
                      <div><dt>Distance</dt><dd>{property.selectedDistanceKm == null ? "n/a" : `${property.selectedDistanceKm} km`}</dd></div>
                      <div><dt>Market fit</dt><dd>{property.marketFit?.opportunityScore ?? "n/a"}/100</dd></div>
                    </dl>
                    <p className="propertyFitExplanation">{property.fitExplanation}</p>
                    <small className="sourceText">Source: {property.sourceUrl ? <a href={property.sourceUrl} target="_blank" rel="noreferrer">verified listing</a> : property.source}</small>
                    <button type="button" className="primaryButton" onClick={() => openPlanModal({ propertyId: property.id, coordinates: property.coordinates, address: property.address, districtId: property.districtId })}>Plan to open in this space</button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No verified commercial properties are currently available in this area" body="TezTap does not generate property listings. Connect a permitted feed or submit a listing for moderation to make real spaces searchable." className="gridEmptyState" />
            )}
            <div className="propertyTransactionComparison">
              <span>Rent vs buy</span>
              <strong>{result.propertyMarketplace?.transactionComparison?.explanation}</strong>
              <small>{result.propertyMarketplace?.transactionComparison?.rent ? `Rent reference: ${formatMoney(result.propertyMarketplace.transactionComparison.rent.monthlyCost)} KZT/month` : "No verified rent reference"} | {result.propertyMarketplace?.transactionComparison?.buy ? `Buy reference: ${formatMoney(result.propertyMarketplace.transactionComparison.buy.purchasePrice)} KZT` : "No verified sale reference"}</small>
            </div>
          </DashboardSection>

          <DashboardSection feature="DYNAMIC_MARKET" className="wideSection marketEvolutionSection primaryDecisionSection orderMarket" icon={TrendingUp} title="Current and Potential Market" narrative={projectedMarket?.explanation || "TezTap separates existing competitors from planned businesses and models future market pressure without contaminating real market data."}>
            <div className="marketEvolutionGrid">
              <article>
                <span>Current market</span>
                <strong>{formatAvailableMetric(plannedImpact.existingCompetitors)}</strong>
                <small>existing competitors</small>
              </article>
              <article>
                <span>Planned market</span>
                <strong>{plannedImpact.plannedCompetitors == null || plannedImpact.verifiedCompetitors == null ? "—" : plannedImpact.plannedCompetitors + plannedImpact.verifiedCompetitors}</strong>
                <small>planned / verified competitors</small>
              </article>
              <article>
                <span>Future pressure</span>
                <strong>{formatAvailableMetric(plannedImpact.futureMarketPressure, "/100")}</strong>
                <small>weighted projected competition</small>
              </article>
              <article>
                <span>Projected opportunity</span>
                <strong>{formatAvailableMetric(plannedImpact.projectedOpportunityScore, "/100")}</strong>
                <small>current score {formatAvailableMetric(plannedImpact.currentOpportunityScore ?? result.opportunityScore?.score, "/100")}</small>
              </article>
            </div>
            <div className="marketTimeline">
              {(plannedImpact.timeline || []).map((item) => (
                <div key={item.stage}>
                  <span>{item.stage}</span>
                  <strong>{item.competitors}</strong>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
            {plannedImpact.congestion?.length ? (
              <div className="pressureWarning">
                <ShieldCheck size={18} />
                <div>
                  <strong>Opportunity congestion detected.</strong>
                  <span>{plannedImpact.congestion[0].nearbyPlannedBusinesses} planned businesses are clustered in {plannedImpact.congestion[0].district}. Consider alternative opportunities.</span>
                </div>
              </div>
            ) : null}
            {plannedImpact.alternativeOpportunity ? (
              <div className="alternativeOpportunity">
                <span>Alternative opportunity detected</span>
                <strong>{plannedImpact.alternativeOpportunity.district}</strong>
                <small>{plannedImpact.alternativeOpportunity.projectedOpportunityScore}/100 projected opportunity with {plannedImpact.alternativeOpportunity.plannedNearby} planned nearby</small>
              </div>
            ) : null}
          </DashboardSection>

          <DashboardSection feature="PLANNED_BUSINESS" className="wideSection plannedBusinessSection primaryDecisionSection orderPlan" icon={Building2} title="My Planned Businesses" narrative="Your private plan details remain yours. Other users only see anonymized market pressure impact.">
            {planStatus ? <p className="statusNote">{planStatus}</p> : null}
            <div className="plannedBusinessList">
              {myPlannedBusinesses.length ? myPlannedBusinesses.slice(0, 8).map((plan) => (
                <article key={plan.id} className={`plannedBusinessCard ${String(plan.status || "PLANNED").toLowerCase()}`}>
                  <div>
                    <span>{plan.status}</span>
                    <strong>{plan.businessName || formatBusinessType(plan.category, options.profiles)}</strong>
                    <small>{plan.address || plan.districtId || "Selected map location"}</small>
                  </div>
                  <dl>
                    <div><dt>Category</dt><dd>{formatBusinessType(plan.category, options.profiles)}</dd></div>
                    <div><dt>Created</dt><dd>{plan.createdAt ? new Date(plan.createdAt).toLocaleDateString() : "n/a"}</dd></div>
                  </dl>
                  <button type="button" className="textButton" onClick={() => cancelPlan(plan.id)}>Cancel</button>
                </article>
              )) : (
                <EmptyState title={session?.token ? "No planned businesses yet" : "Sign in to manage plans"} body="Use Plan to Open Here or click a map location to add future-market data after signing in." className="gridEmptyState" />
              )}
            </div>
          </DashboardSection>

          <DashboardSection className="wideSection geoRankingSection" icon={Gauge} title="District command ranking" narrative="District rankings combine competition density, underserved demand, saturation, activity, and investment attractiveness from the live analysis object.">
            <div className="districtRankingGrid">
              {districtRankings.length ? districtRankings.map((district) => (
                <article className={`districtRankCard ${district.heat.tone}`} key={district.district}>
                  <div className="rankHeader">
                    <span>#{district.rank}</span>
                    <strong>{district.district}</strong>
                    <small>{district.heat.label}</small>
                  </div>
                  <div className="rankScore">
                    <strong>{district.opportunityScore}</strong>
                    <span>opportunity</span>
                  </div>
                  <div className="rankBars">
                    <FactorBar label="Activity" value={district.footTraffic} />
                    <FactorBar label="Underserved" value={district.underservedScore} />
                    <FactorBar label="Investment fit" value={Math.max(1, 100 - district.rentIndex)} />
                  </div>
                  <dl>
                    <div><dt>Nearby density</dt><dd>{district.nearbyCompetitors} competitors</dd></div>
                    <div><dt>Saturation</dt><dd>{district.saturation}</dd></div>
                    <div><dt>Anchors</dt><dd>{district.anchors?.length ? district.anchors.join(", ") : "No anchors returned"}</dd></div>
                  </dl>
                </article>
              )) : (
                <EmptyState
                  title="No district rankings"
                  body="The analysis did not return district-level records for this market."
                  className="gridEmptyState"
                />
              )}
            </div>
          </DashboardSection>

          <DashboardSection icon={Target} title={t.score} narrative={result.aiNarratives.score}>
            <div className="scoreBlock">
              <div className="scoreDial" style={{ "--score": result.opportunityScore.score }}>
                <div>
                  <strong>{result.opportunityScore.score}</strong>
                  <span>{result.opportunityScore.label}</span>
                </div>
              </div>
              <div className="factorStack">
                {Object.entries(result.opportunityScore.factors).filter(([, value]) => Number.isFinite(value)).map(([name, value]) => (
                  <FactorBar key={name} label={formatFactorName(name)} value={value} />
                ))}
              </div>
            </div>
            {result.proprietaryScoring ? (
              <div className="proprietaryScorePanel">
                <div className="proprietaryScoreHeader">
                  <span>TezTap proprietary scoring</span>
                  <strong>Budget-aware viability model</strong>
                  <small>Calculated from budget, competition, demand, district conditions, pricing, and saturation.</small>
                </div>
                <div className="proprietaryScoreGrid">
                  {Object.entries(result.proprietaryScoring.scores || {}).map(([key, value]) => (
                    <Kpi key={key} label={formatFactorName(key)} value={key === "successProbability" ? `${value}%` : `${value}/100`} />
                  ))}
                </div>
                <div className="scenarioComparisonGrid">
                  {(result.proprietaryScoring.comparisons?.scenarios || []).slice(0, 2).map((scenario) => (
                    <article key={`${scenario.label}-${scenario.district}`}>
                      <div>
                        <span>{scenario.label}</span>
                        <strong>{scenario.businessType} / {scenario.district}</strong>
                        <small>{scenario.recommendation}</small>
                      </div>
                      <dl>
                        <div><dt>Success Probability</dt><dd>{scenario.successProbability}%</dd></div>
                        <div><dt>Risk</dt><dd>{scenario.riskScore}/100</dd></div>
                        <div><dt>Opportunity</dt><dd>{scenario.opportunityScore}/100</dd></div>
                      </dl>
                      <p>{scenario.why}</p>
                    </article>
                  ))}
                </div>
                <div className="proprietaryComparisonGrid">
                  <article>
                    <span>Realistic categories</span>
                    {(result.proprietaryScoring.budgetIntelligence?.realisticCategories || []).slice(0, 3).map((category) => (
                      <strong key={category.businessType}>{category.title} <small>{category.budgetRealismScore}/100</small></strong>
                    ))}
                    {!(result.proprietaryScoring.budgetIntelligence?.realisticCategories || []).length ? <small>No full-launch category is realistic at this budget.</small> : null}
                  </article>
                  <article>
                    <span>Unrealistic categories</span>
                    {(result.proprietaryScoring.budgetIntelligence?.unrealisticCategories || []).slice(0, 3).map((category) => (
                      <strong key={category.businessType}>{category.title} <small>short {formatMoney(category.budgetShortfall)} KZT</small></strong>
                    ))}
                    {!(result.proprietaryScoring.budgetIntelligence?.unrealisticCategories || []).length ? <small>No unrealistic category was flagged.</small> : null}
                  </article>
                  <article>
                    <span>Alternative recommendations</span>
                    {(result.proprietaryScoring.budgetIntelligence?.alternativeRecommendations || []).slice(0, 3).map((item, index) => (
                      <strong key={`${item.type}-${item.businessType}-${index}`}>{item.title} <small>{item.reason}</small></strong>
                    ))}
                  </article>
                </div>
                <div className="proprietaryComparisonGrid compact">
                  <article>
                    <span>District comparison</span>
                    {(result.proprietaryScoring.comparisons?.districts || []).slice(0, 3).map((district) => (
                      <strong key={district.district}>{district.district} <small>{district.investmentAttractiveness}/100 investment attractiveness. {district.why}</small></strong>
                    ))}
                  </article>
                  <article>
                    <span>Budget comparison</span>
                    {(result.proprietaryScoring.comparisons?.budgets || []).slice(0, 4).map((budget) => (
                      <strong key={budget.budget}>{formatMoney(budget.budget)} KZT <small>{budget.viability} - {budget.riskLevel}</small></strong>
                    ))}
                  </article>
                </div>
              </div>
            ) : null}
          </DashboardSection>

          <DashboardSection icon={Calculator} title={t.probability} narrative={result.aiNarratives.probability}>
            <div className="probabilityGrid">
              <Kpi label="Success" value={`${result.probability.successProbability}%`} />
              <Kpi label="Profitability" value={`${result.probability.profitabilityProbability}%`} />
              <Kpi label="Survival" value={`${result.probability.survivalProbability}%`} />
            </div>
            <div className="formulaList">
              {result.probability.formulas?.length ? result.probability.formulas.map((formula) => (
                <article key={formula.label}>
                  <strong>{formula.label}</strong>
                  <code>{formula.expression}</code>
                  <span>{formula.result}</span>
                </article>
              )) : (
                <EmptyState
                  title="No formulas returned"
                  body="The probability engine did not return formula details for this analysis."
                  className="inlineEmptyState"
                />
              )}
            </div>
          </DashboardSection>

          <DashboardSection className="wideSection" icon={TrendingUp} title={t.prices} narrative={result.aiNarratives.prices}>
            <div className="chartSplit">
              <ChartCard
                title="Pricing distribution"
                isEmpty={!result.charts?.priceDistribution?.length}
                emptyText="No verified public price samples were returned for this query."
              >
                <BarChart data={result.charts?.priceDistribution || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <ChartTooltip formatter={(value) => formatMoney(value)} />
                  <Bar dataKey="count" fill="#66a6ff" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartCard>
              <AccessGate compact feature="FORECASTING"><ChartCard
                title="Profitability projection"
                isEmpty={!result.charts?.profitabilityProjection?.length}
                emptyText="No projection was returned for the current budget and business type."
              >
                <AreaChart data={result.charts?.profitabilityProjection || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => compactMoney(value)} />
                  <ChartTooltip formatter={(value) => `${formatMoney(value)} KZT`} />
                  <Area type="monotone" dataKey="revenue" stroke="#39d98a" fill="#39d98a33" />
                  <Line type="monotone" dataKey="netProfit" stroke="#ffb454" strokeWidth={2} dot={false} />
                </AreaChart>
              </ChartCard></AccessGate>
            </div>

            <Toolbar icon={Search} value={priceQuery} onChange={setPriceQuery} placeholder={t.search} count={visiblePrices.length} totalCount={filteredPrices.length} />
            <div className="priceGrid">
              {visiblePrices.map((record) => (
                <article className="priceCard" key={`${record.businessName}-${record.productName}-${record.price}`}>
                  <strong>{record.productName} {"->"} {formatMoney(record.price)} KZT</strong>
                  <span>{record.businessName} - {record.area}</span>
                  <small>{record.category} - {record.confidence}</small>
                </article>
              ))}
              {!filteredPrices.length ? (
                <EmptyState
                  title={priceQuery ? "No matching prices" : "No public prices"}
                  body={priceQuery ? "Try a different product, district, business, or category search." : "The API did not return verified product-level prices for this query."}
                  className="gridEmptyState"
                />
              ) : null}
            </div>
            {hiddenPriceCount ? <p className="sourceText listNotice">Showing first {visiblePrices.length} of {filteredPrices.length} price records. Use search to narrow the list.</p> : null}
            {result.businessCategoryStats?.length ? (
              <div className="priceGrid">
                {result.businessCategoryStats.map((category) => (
                  <article className="priceCard" key={category.category}>
                    <strong>{category.category}</strong>
                    <span>{category.competitorCount} competitors - {category.priceSamples} price samples</span>
                    <small>
                      Avg price {formatMoney(category.averagePrice)} KZT - Avg rating {category.averageRating || "n/a"}
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
          </DashboardSection>

          <DashboardSection className="wideSection" icon={Table2} title={t.competitors} narrative={result.aiNarratives.competitors}>
            <div className="chartSplit compactCharts">
              <ChartCard
                title="District comparison"
                isEmpty={!result.charts?.districtComparison?.length}
                emptyText="No district comparison was returned for this query."
              >
                <BarChart data={result.charts?.districtComparison || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="district" />
                  <YAxis />
                  <ChartTooltip />
                  <Bar dataKey="score" fill="#39d98a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="competitors" fill="#ff6b8a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartCard>
              <ChartCard
                title="Rating signal"
                isEmpty={!result.charts?.ratingDistribution?.length}
                emptyText="No rating distribution was returned for the current competitors."
              >
                <PieChart>
                  <Pie data={result.charts?.ratingDistribution || []} dataKey="count" nameKey="range" outerRadius={82}>
                    {(result.charts?.ratingDistribution || []).map((entry, index) => (
                      <Cell key={entry.range} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip />
                </PieChart>
              </ChartCard>
            </div>

            <Toolbar icon={Search} value={competitorQuery} onChange={setCompetitorQuery} placeholder={t.search} count={visibleCompetitors.length} totalCount={filteredCompetitors.length} />
            {filteredCompetitors.length ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Competitor</th>
                    <th>District</th>
                    <th>Rating</th>
                    <th>Prices</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCompetitors.map((competitor) => (
                    <tr key={`${competitor.name}-${competitor.area}-${competitor.address}`}>
                      <td>
                        <strong>{competitor.name}</strong>
                        <span>{competitor.address || "Address unavailable"}</span>
                      </td>
                      <td>{competitor.area}</td>
                      <td>{competitor.rating ? `${competitor.rating} (${formatMoney(competitor.ratingsCount)})` : "Not listed"}</td>
                      <td>
                        <div className="miniChips">
                          {(competitor.priceSamples || []).slice(0, 4).map((sample) => (
                            <span key={`${competitor.name}-${sample.productName}`}>{sample.productName} {"->"} {formatMoney(sample.price || sample.value)} KZT</span>
                          ))}
                          {!competitor.priceSamples?.length ? <span>{competitor.sourceNote}</span> : null}
                        </div>
                      </td>
                      <td>{competitor.sourceUrl ? <a href={competitor.sourceUrl} target="_blank" rel="noreferrer">{competitor.sourceName || "Source"}</a> : competitor.sourceName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
              <EmptyState
                title={competitorQuery ? "No matching competitors" : "No competitors returned"}
                body={competitorQuery ? "Try a different competitor, district, category, or source search." : "The API did not return competitor records for this query."}
                className="tableEmptyState"
              />
            )}
            {hiddenCompetitorCount ? <p className="sourceText listNotice">Showing first {visibleCompetitors.length} of {filteredCompetitors.length} competitor records. Use search to narrow the list.</p> : null}
          </DashboardSection>

          <DashboardSection icon={Bot} title={t.recommendations} narrative={result.aiNarratives.recommendations}>
            <div className="recommendationStack">
              <article>
                <span>Best business type</span>
                <strong>{result.profile.title}</strong>
                <p>{result.recommendation.explanation}</p>
              </article>
              <article>
                <span>Pricing strategy</span>
                <strong>{result.recommendation.pricePosition}</strong>
                <p>{result.recommendation.pricingStrategy}</p>
              </article>
              <article>
                <span>Next actions</span>
                {result.recommendation.nextActions?.length ? (
                  <ul>
                    {result.recommendation.nextActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                ) : (
                  <p>No next actions were returned for this analysis.</p>
                )}
              </article>
            </div>
          </DashboardSection>

          {result.strategicIntelligence ? (
          <DashboardSection className="wideSection intelligenceSuiteSection" icon={ShieldCheck} title="Strategic intelligence suite" narrative="Strategy modules generated from the same market, district, pricing, probability, and competitor metrics shown in the dashboard.">
            <div className="swotGrid">
              {Object.entries(result.strategicIntelligence.swot || {}).length ? Object.entries(result.strategicIntelligence.swot || {}).map(([group, items]) => (
                <article className={`swotCard ${group}`} key={group}>
                  <span>{group}</span>
                  <ul>
                    {(items || []).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </article>
              )) : (
                <EmptyState title="No SWOT data" body="The analysis did not return SWOT records." className="gridEmptyState" />
              )}
            </div>

            <div className="intelligenceGrid">
              <article>
                <span>Competitor analysis</span>
                <strong>{result.strategicIntelligence.competitorAnalysis?.marketDensity || "Not available"}</strong>
                <p>{result.strategicIntelligence.competitorAnalysis?.interpretation || "No competitor interpretation was returned."}</p>
                <div className="miniIntelList">
                  {result.strategicIntelligence.competitorAnalysis?.topCompetitors?.length ? result.strategicIntelligence.competitorAnalysis.topCompetitors.map((competitor) => (
                    <div key={`${competitor.name}-${competitor.district}`}>
                      <strong>{competitor.name}</strong>
                      <small>{competitor.district} - {competitor.strategicSignal}</small>
                    </div>
                  )) : <p className="sourceText">No top competitors were returned.</p>}
                </div>
              </article>

              <article>
                <span>Risk analysis</span>
                <strong>{result.strategicIntelligence.riskAnalysis?.[0]?.level || "Not available"}</strong>
                <div className="miniIntelList">
                  {result.strategicIntelligence.riskAnalysis?.length ? result.strategicIntelligence.riskAnalysis.map((risk) => (
                    <div key={risk.label}>
                      <strong>{risk.label}: {risk.level}</strong>
                      <small>{risk.evidence}</small>
                    </div>
                  )) : <p className="sourceText">No risk records were returned.</p>}
                </div>
              </article>

              <article>
                <span>Market gap detection</span>
                <strong>{result.strategicIntelligence.marketGapDetection?.[0]?.signal || "Not available"}</strong>
                <div className="miniIntelList">
                  {result.strategicIntelligence.marketGapDetection?.length ? result.strategicIntelligence.marketGapDetection.slice(0, 4).map((gap) => (
                    <div key={gap.district}>
                      <strong>{gap.district}: {gap.underservedScore}/100</strong>
                      <small>{gap.directCompetitors} direct, {gap.nearbyCompetitors} nearby competitors</small>
                    </div>
                  )) : <p className="sourceText">No market-gap records were returned.</p>}
                </div>
              </article>

              <article>
                <span>Pricing and category intelligence</span>
                <strong>{result.strategicIntelligence.pricingIntelligence?.evidence || "No"} evidence</strong>
                <p>{result.strategicIntelligence.pricingIntelligence?.interpretation || "No pricing interpretation was returned."}</p>
                <p>{result.strategicIntelligence.categoryIntelligence?.interpretation || "No category interpretation was returned."}</p>
              </article>
            </div>
          </DashboardSection>
          ) : null}

          <DashboardSection feature="EXPORT" className="exportSection" icon={Download} title="Exports" narrative="Reports use the same live analysis object, source metadata, product-level prices, and formulas shown in the dashboard.">
            <div className="exportActions">
              <button type="button" className="secondaryButton" onClick={() => exportReport()}>
                <Download size={17} />
                {t.report}
              </button>
              <button type="button" className="secondaryButton" onClick={() => exportReport({ print: true })}>
                <Printer size={17} />
                {t.pdf}
              </button>
              <button type="button" className="secondaryButton" onClick={exportJson}>
                <Download size={17} />
                {t.json}
              </button>
            </div>
          </DashboardSection>

          <DashboardSection className="dataSourcesSection" icon={Database} title={t.dataSourcesTitle} narrative={t.dataSourcesBody}>
            <div className="dataSourceGrid">
              <article>
                <span>{t.primarySource}</span>
                <strong>{result.sources?.businesses?.primary?.name || result.sources?.businesses?.name || "Not available"}</strong>
                <small>{result.sources?.businesses?.primary?.status || result.sources?.businesses?.status || "unknown"} · {result.sources?.businesses?.primary?.count ?? result.sources?.businesses?.count ?? 0} records</small>
              </article>
              <article>
                <span>{t.fallbackSource}</span>
                <strong>{result.sources?.businesses?.fallback?.name || "Not configured"}</strong>
                <small>{result.sources?.businesses?.fallback?.status || "not used"} · fallback only</small>
              </article>
              <article>
                <span>{t.prices}</span>
                <strong>{result.sources?.prices?.verifiedLocalRecords ?? result.sources?.prices?.totalRecords ?? 0} verified records</strong>
                <small>Prices stay empty without evidence source</small>
              </article>
            </div>
          </DashboardSection>

          <section className="analysisDisclosureBar primaryDecisionSection orderDisclosure">
            <div>
              <strong>{fullAnalysisOpen ? "Advanced analysis is open" : "Need the underlying calculations?"}</strong>
              <span>{fullAnalysisOpen ? "District tables, formulas, pricing, forecasts, and strategic modules are visible." : "Open the full analysis for formulas, tables, forecasts, and detailed market intelligence."}</span>
            </div>
            <button type="button" className="secondaryButton" onClick={() => setFullAnalysisOpen((value) => !value)}>
              {fullAnalysisOpen ? "Hide Full Analysis" : "View Full Analysis"}
            </button>
          </section>
        </motion.section>
        ) : result ? (
          <BasicAnalysis key="basic-analysis" result={result} selectedLocation={selectedDecisionLocation} onLocationSelect={setSelectedDecisionLocation} />
        ) : isInitialAnalysisLoading ? (
          <DashboardSkeleton key="dashboard-skeleton" />
        ) : error ? (
          <motion.section
            key="dashboard-error"
            className="emptyState glassPanel dashboardStateShell"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <ErrorState
              title={status === "offline" ? "Analysis service is unavailable" : "Analysis could not be loaded"}
              body={error}
              onRetry={() => runAnalysis()}
              className="bareState"
            />
          </motion.section>
        ) : (
          <PreAnalysisDashboard key="dashboard-empty" form={form} isFormComplete={isFormComplete} />
        )}
      </AnimatePresence>

      {planModal ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setPlanModal(null)}>
          <motion.form
            className="planModal glassPanel"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={submitPlannedBusiness}
          >
            <div className="panelHeader compact">
              <div>
                <span className="eyebrow">Planned business</span>
                <h2>Confirm Business Plan</h2>
              </div>
              <button type="button" className="iconButton" onClick={() => setPlanModal(null)}>×</button>
            </div>
            <p className="sourceText">You are adding a planned business to TezTap's market model. It will affect projected analytics, but it will not be counted as an existing business.</p>
            <div className="planSummaryGrid">
              <div><span>Business category</span><strong>{formatBusinessType(planModal.category, options.profiles)}</strong></div>
              <div><span>Exact location</span><strong>{planModal.coordinates.lat.toFixed(5)}, {planModal.coordinates.lng.toFixed(5)}</strong></div>
              <div><span>Address</span><strong>{planModal.address}</strong></div>
              <div><span>District</span><strong>{planModal.districtId || "Selected map point"}</strong></div>
              <div><span>Commercial property</span><strong>{planModal.propertyId ? "Selected verified listing" : "No property selected"}</strong></div>
            </div>
            <label>
              <span>Business name optional</span>
              <input value={planForm.businessName} onChange={(event) => setPlanForm((current) => ({ ...current, businessName: event.target.value }))} placeholder="e.g. TezTap Coffee" />
            </label>
            <label>
              <span>Budget optional</span>
              <input type="number" min="0" value={planForm.budget} onChange={(event) => setPlanForm((current) => ({ ...current, budget: event.target.value }))} placeholder="0" />
            </label>
            <label>
              <span>Business format optional</span>
              <input value={planForm.businessFormat} onChange={(event) => setPlanForm((current) => ({ ...current, businessFormat: event.target.value }))} placeholder="kiosk, premium cafe, branch, pop-up" />
            </label>
            {planStatus ? <p className="errorText">{planStatus}</p> : null}
            <div className="modalActions">
              <button type="button" className="secondaryButton" onClick={() => setPlanModal(null)}>Cancel</button>
              <button type="submit" className="primaryButton" disabled={planLoading}>{planLoading ? "Adding..." : "Confirm Business Plan"}</button>
            </div>
          </motion.form>
        </div>
      ) : null}
    </main>
  );
}

function DecisionOverview({ result, selectedLocation, whyScoreOpen, onToggleWhy, onSelectLocation }) {
  const options = buildDecisionOptions(result);
  const selectedDistrict = findDistrictResult(result, selectedLocation?.districtId) || options[0]?.district || null;
  const selectedDistrictName = selectedDistrict?.district || selectedDistrict?.name || null;
  const bestDistrictName = result.recommendation?.bestArea || options[0]?.district?.district || options[0]?.district?.name || null;
  const opportunityScore = result.opportunityScore?.score;
  const locationScore = selectedDistrict?.opportunityScore ?? selectedDistrict?.score ?? null;
  const risk = result.analyticsEngine?.riskAnalysis || {};
  const confidence = result.analyticsEngine?.confidence || {};
  const reasons = buildDecisionReasons({ result, district: selectedDistrict });
  const risks = buildDecisionRisks(result);
  const factorRows = buildScoreFactors(result);
  const demographicFit = result.demographics?.fitScore ?? result.demographicFit?.score ?? null;
  const sources = buildVisibleSources(result);

  return (
    <section className="glassPanel dashboardSection wideSection decisionOverview primaryDecisionSection orderSummary">
      <div className="decisionOverviewHeader">
        <div>
          <span className="eyebrow">{selectedDistrictName && bestDistrictName && selectedDistrictName !== bestDistrictName ? "Selected option" : "Best match"}</span>
          <h2>{selectedDistrictName || result.recommendation?.bestArea || "No ranked location"}</h2>
          <p>{formatBusinessType(result.input?.businessType)} in {result.input?.city}, {result.input?.country || "Kazakhstan"} · Location score {formatAvailableMetric(locationScore, "/100")}</p>
        </div>
        <div className="decisionScoreHero">
          <span>Opportunity Score</span>
          <strong>{opportunityScore == null ? "—" : `${opportunityScore}/100`}</strong>
          <button type="button" className="textButton" onClick={onToggleWhy}>Why this score?</button>
        </div>
      </div>

      <div className="decisionMetricStrip">
        <DecisionMetric label="Risk level" value={risk.level || "N/A"} detail={risk.riskScore == null ? "Insufficient data" : `${risk.riskScore}/100 calculated`} />
        <DecisionMetric label="Competition" value={selectedDistrict?.nearbyCompetitors ?? selectedDistrict?.competitorCountNearby ?? result.market?.competitorCount ?? "N/A"} detail="observed competitors" />
        <DecisionMetric label="Target audience fit" value={demographicFit == null ? "N/A" : `${demographicFit}/100`} detail={demographicFit == null ? "No demographic dataset connected" : "calculated demographic fit"} />
        <AccessGate compact feature="FUTURE_MARKET_PRESSURE"><DecisionMetric label="Future market pressure" value={result.projectedMarket?.futureMarketPressure == null ? "N/A" : `${result.projectedMarket.futureMarketPressure}/100`} detail="projected from user-reported plans" /></AccessGate>
        <DecisionMetric label="Data confidence" value={confidenceLabel(confidence.score)} detail={confidence.score == null ? "Not calculated" : `${confidence.score}/100 data quality`} />
      </div>

      <div className="decisionEvidenceGrid">
        <article>
          <span>Why this location?</span>
          {reasons.length ? reasons.map((reason) => <p key={reason}>{reason}</p>) : <p>Insufficient district evidence to explain this recommendation.</p>}
        </article>
        <article>
          <span>Main risks</span>
          {risks.length ? risks.map((riskItem) => <p key={riskItem}>{riskItem}</p>) : <p>No material risk explanation was returned.</p>}
        </article>
      </div>

      {options.length ? (
        <div className="decisionAlternativeGrid">
          {options.map((option) => (
            <button
              type="button"
              className={selectedDistrict && (selectedDistrict.district || selectedDistrict.name) === (option.district.district || option.district.name) ? "active" : ""}
              key={`${option.label}-${option.district.district || option.district.name}`}
              onClick={() => onSelectLocation({
                coordinates: option.district.coordinates,
                address: option.district.district || option.district.name,
                districtId: option.district.district || option.district.name,
                opportunityScore: option.district.opportunityScore ?? option.district.score
              })}
            >
              <span>{option.label}</span>
              <strong>{option.district.district || option.district.name}</strong>
              <small>{option.district.opportunityScore ?? option.district.score ?? "N/A"}/100 opportunity</small>
            </button>
          ))}
        </div>
      ) : null}

      {whyScoreOpen ? (
        <div className="scoreTransparencyPanel">
          <div>
            <span>Calculated analytics</span>
            <strong>Opportunity Score factors</strong>
            <small>Only factors used by the deterministic scoring engine are shown.</small>
          </div>
          <div className="scoreFactorTable">
            {factorRows.map((factor) => (
              <div key={factor.key}>
                <span>{factor.label}</span>
                <strong>{factor.value}/100</strong>
                <small>{factor.weight}% weight · {factor.availability}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="analysisProvenance">
        <span><i className="observed" /> Observed data</span>
        <span><i className="calculated" /> Calculated analytics</span>
        <span><i className="projected" /> Projected values</span>
        <span><i className="reported" /> User-reported plans</span>
        <span><i className="ai" /> AI explanation</span>
      </div>
      <div className="decisionSourceLine">
        <Database size={15} />
        <span>{sources.length ? sources.join(" · ") : "No named data source returned"}</span>
        <small>Last updated: {formatTimestamp(result.meta?.generatedAt || result.analytics?.refreshedAt)}</small>
      </div>
    </section>
  );
}

function DecisionMetric({ label, value, detail }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function buildDecisionOptions(result) {
  const districts = enrichDistrictRows(result);
  if (!districts.length) return [];
  const score = (district) => Number(district.opportunityScore ?? district.score ?? 0);
  const nearby = (district) => Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0);
  const saturationRows = result.analyticsEngine?.saturation?.districts || [];
  const risk = (district) => {
    const name = district.district || district.name;
    const saturation = saturationRows.find((item) => item.district === name);
    return Number(saturation?.saturationScore ?? nearby(district) * 20);
  };
  const selected = [];
  const add = (label, district) => {
    if (!district) return;
    const name = district.district || district.name;
    if (!name || selected.some((item) => (item.district.district || item.district.name) === name)) return;
    selected.push({ label, district });
  };
  add("#1 Best overall", districts.slice().sort((left, right) => score(right) - score(left))[0]);
  add("#2 Lower risk", districts.slice().sort((left, right) => risk(left) - risk(right) || score(right) - score(left))[0]);
  const growthRows = result.analyticsEngine?.growthPotential?.districts || [];
  const growth = growthRows[0];
  add("#3 Growth opportunity", districts.find((district) => (district.district || district.name) === growth?.district) || districts.slice().sort((left, right) => Number(right.underservedScore || 0) - Number(left.underservedScore || 0))[0]);
  return selected.slice(0, 3);
}

function findDistrictResult(result, districtName) {
  if (!districtName) return null;
  return enrichDistrictRows(result).find((district) => (district.district || district.name) === districtName) || null;
}

function enrichDistrictRows(result) {
  const areas = result.opportunityAreas || [];
  const areaByName = new Map(areas.map((area) => [area.name, area]));
  const rows = result.districtMetrics?.length ? result.districtMetrics : areas;

  return rows.map((district) => {
    const name = district.district || district.name;
    const area = areaByName.get(name) || {};
    return {
      ...area,
      ...district,
      name: district.name || area.name || name,
      district: district.district || name,
      coordinates: district.coordinates || area.coordinates || null
    };
  });
}

function buildDecisionReasons({ result, district }) {
  if (!district) return [];
  const rows = [
    Number.isFinite(Number(district.opportunityScore ?? district.score)) ? `District opportunity is ${district.opportunityScore ?? district.score}/100.` : null,
    Number.isFinite(Number(district.nearbyCompetitors ?? district.competitorCountNearby)) ? `${district.nearbyCompetitors ?? district.competitorCountNearby} competitors were observed near this location.` : null,
    Number.isFinite(Number(district.underservedScore)) ? `Underserved demand is ${district.underservedScore}/100.` : null,
    Number.isFinite(Number(district.footTraffic)) ? `Location activity signal is ${district.footTraffic}/100.` : null,
    result.budgetPlan?.budgetRealismScore != null ? `Budget fit is ${result.budgetPlan.budgetRealismScore}/100 for the selected business model.` : null
  ];
  return rows.filter(Boolean).slice(0, 5);
}

function buildDecisionRisks(result) {
  const risk = result.analyticsEngine?.riskAnalysis || {};
  const rows = [];
  if (result.budgetPlan?.budgetShortfall > 0) rows.push(`Budget is short by ${formatMoney(result.budgetPlan.budgetShortfall)} KZT versus the minimum viable model.`);
  if (risk.drivers?.saturationRisk >= 45) rows.push(`Saturation risk is ${risk.drivers.saturationRisk}/100.`);
  if (risk.drivers?.pricingRisk >= 45) rows.push(`Pricing evidence risk is ${risk.drivers.pricingRisk}/100 because verified samples are limited or dispersed.`);
  if (risk.drivers?.budgetRisk >= 45) rows.push(`Capital risk is ${risk.drivers.budgetRisk}/100.`);
  return rows.slice(0, 4);
}

function buildScoreFactors(result) {
  const weights = { competition: 12, pricing: 10, ratingGap: 8, underservedDemand: 12, saturation: 10, profitability: 12, budgetRealism: 36 };
  const factors = result.opportunityScore?.factors || {};
  return Object.entries(factors).map(([key, value]) => ({
    key,
    label: formatFactorName(key),
    value,
    weight: weights[key] || 0,
    availability: key === "pricing" && !result.stats?.sampleCount
      ? "baseline used; verified prices unavailable"
      : key === "ratingGap" && !(result.competitors || []).some((item) => Number(item.rating) > 0)
        ? "baseline used; ratings unavailable"
        : "data available"
  }));
}

function buildVisibleSources(result) {
  const plannedCount = Number(result.projectedMarket?.plannedCompetitors || 0)
    + Number(result.projectedMarket?.verifiedCompetitors || 0);
  const values = [
    result.sources?.businesses?.primary?.name || result.sources?.businesses?.name,
    result.sources?.businesses?.fallback?.status === "used" ? result.sources?.businesses?.fallback?.name : null,
    result.sources?.prices?.verifiedLocalRecords > 0 ? "Verified price records" : null,
    plannedCount > 0 ? "TezTap user-reported plans" : null,
    result.propertyMarketplace?.properties?.length ? "Verified commercial property listings" : null
  ];
  return [...new Set(values.filter(Boolean))];
}

function confidenceLabel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "N/A";
  return value >= 78 ? "High" : value >= 58 ? "Medium" : "Low";
}

function formatTimestamp(value) {
  if (!value) return "unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unavailable" : date.toLocaleString();
}

function formatAvailableMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}${suffix}` : "—";
}

function calculateDistanceKm(left, right) {
  const toRadians = (value) => Number(value) * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(right.lat) - Number(left.lat));
  const dLng = toRadians(Number(right.lng) - Number(left.lng));
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

function PreAnalysisDashboard({ form, isFormComplete }) {
  const readinessItems = [
    { label: "City selected", complete: Boolean(form.city) },
    { label: "Business category selected", complete: Boolean(form.businessType) },
    { label: "Budget entered", complete: Number.isFinite(Number(form.budget)) && Number(form.budget) > 0 },
    { label: "Analysis requested", complete: false }
  ];

  return (
    <motion.section
      className="dashboardGrid preAnalysisDashboard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
    >
      <section className="glassPanel dashboardSection wideSection preAnalysisHero">
        <div className="panelHeader compact">
          <div>
            <span className="eyebrow"><ShieldCheck size={14} /> Analysis locked</span>
            <h2>{isFormComplete ? "Ready to calculate" : "Enter business data to begin analysis"}</h2>
          </div>
        </div>
        <p className="aiNarrative">
          Waiting for market analysis. Metrics, charts, map layers, scores, and AI explanations will appear only after the backend finishes a requested analysis.
        </p>
        <div className="readinessGrid">
          {readinessItems.map((item) => (
            <article className={item.complete ? "ready" : ""} key={item.label}>
              <span>{item.complete ? "Ready" : "Waiting"}</span>
              <strong>{item.label}</strong>
            </article>
          ))}
        </div>
      </section>

    </motion.section>
  );
}

function MarkdownContent({ content, streaming = false }) {
  const lines = String(content || "").split("\n");
  const nodes = [];
  let listItems = [];

  function flushList(key) {
    if (!listItems.length) {
      return;
    }

    nodes.push(
      <ul className="markdownList" key={`list-${key}`}>
        {listItems.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(index);
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }

    flushList(index);

    if (/^#{1,3}\s+/.test(trimmed)) {
      nodes.push(<strong className="markdownHeading" key={`heading-${index}`}>{renderInlineMarkdown(trimmed.replace(/^#{1,3}\s+/, ""))}</strong>);
    } else {
      nodes.push(<p key={`paragraph-${index}`}>{renderInlineMarkdown(trimmed)}</p>);
    }
  });

  flushList("end");

  return (
    <div className="markdownBody">
      {nodes.length ? nodes : <p />}
      {streaming ? <span className="streamCursor" aria-hidden="true" /> : null}
    </div>
  );
}

function renderInlineMarkdown(text) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function ConsultantEvidencePanel({ intelligence }) {
  const linked = intelligence.linkedAnalytics || {};
  const context = linked.structuredAiContext || {};
  const districts = intelligence.recommendedDistricts || [];
  const risks = intelligence.riskFactors || [];
  const insights = intelligence.insights || [];
  const confidence = intelligence.aiConfidence || {};
  const underserved = intelligence.underservedMarketDetection || [];
  const simulations = intelligence.comparativeSimulations || [];
  const opportunityCards = intelligence.opportunityCards || [];
  const riskSummaries = intelligence.riskSummaries || [];
  const districtComparison = intelligence.districtComparison || [];
  const pricingSummary = intelligence.pricingSummary || null;
  const saturationIndicators = intelligence.saturationIndicators || [];
  const marketGapEngine = intelligence.marketGapEngine || null;
  const boiScore = intelligence.boiScore || marketGapEngine?.boi || null;
  const strategicAdvisor = intelligence.strategicAdvisor || marketGapEngine?.strategicAdvisor || null;

  return (
    <div className="consultantEvidencePanel">
      <div className="consultantEvidenceMetrics">
        <article>
          <span>Confidence</span>
          <strong>{confidence.label || intelligence.confidenceLevel || "Low"} - {Math.round(Number(confidence.score ?? intelligence.confidenceScore) || 0)}/100</strong>
        </article>
        <article>
          <span>Intent</span>
          <strong>{formatFactorName(intelligence.intent || "executive_summary")}</strong>
        </article>
        <article>
          <span>District</span>
          <strong>{context.district || districts[0]?.district || "n/a"}</strong>
        </article>
        <article>
          <span>Density</span>
          <strong>{context.competitionDensity ?? "n/a"}</strong>
        </article>
      </div>

      {insights.length ? (
        <div className="consultantEvidenceBlock">
          <span>Linked insights</span>
          {insights.slice(0, 3).map((insight) => (
            <p key={`${insight.type}-${insight.message}`}>{insight.message}</p>
          ))}
        </div>
      ) : null}

      {opportunityCards.length ? <OpportunityCardGrid cards={opportunityCards} /> : null}

      {boiScore ? <BoiScoreCard boi={boiScore} /> : null}

      {marketGapEngine ? <MarketGapEnginePanel engine={marketGapEngine} /> : null}

      {strategicAdvisor ? <StrategicAdvisorPanel advisor={strategicAdvisor} /> : null}

      <div className="consultantInlineCharts">
        {districts.length ? <DistrictRecommendationChart districts={districts} /> : null}
        {simulations.length ? <SimulationChart simulation={simulations[0]} /> : null}
      </div>

      <div className="consultantDynamicGrid">
        {pricingSummary ? <PricingSummaryCard pricing={pricingSummary} /> : null}
        {saturationIndicators.length ? <SaturationIndicatorCard indicators={saturationIndicators} /> : null}
      </div>

      {districtComparison.length ? <DistrictComparisonTable rows={districtComparison} /> : null}

      {riskSummaries.length ? <RiskSummaryGrid risks={riskSummaries} /> : null}

      {confidence.explanation ? (
        <div className="consultantEvidenceBlock">
          <span>Confidence explanation</span>
          <p>{confidence.explanation}</p>
        </div>
      ) : null}

      {underserved.length ? (
        <div className="consultantEvidenceBlock">
          <span>Underserved market detection</span>
          {underserved.slice(0, 3).map((signal) => (
            <p key={`${signal.type}-${signal.district || signal.category || signal.message}`}>
              <strong>{formatFactorName(signal.type || "market_gap")}</strong>: {signal.message}
            </p>
          ))}
        </div>
      ) : null}

      {simulations.length ? (
        <div className="consultantEvidenceBlock">
          <span>Comparative simulation</span>
          {simulations.slice(0, 2).map((simulation) => (
            <p key={simulation.id || simulation.name}>
              <strong>{simulation.name}</strong>: {simulation.before.scenario || "Scenario A"} {simulation.before.successProbability}% in {simulation.before.district} {"->"} {simulation.after.scenario || "Scenario B"} {simulation.after.successProbability}% in {simulation.after.district}. {simulation.probabilityDelta.explanation} Why: {simulation.after.why}
            </p>
          ))}
        </div>
      ) : null}

      <div className="consultantEvidenceSplit">
        <div className="consultantEvidenceBlock">
          <span>Recommended districts</span>
          {districts.length ? districts.slice(0, 3).map((district) => (
            <p key={district.district}>
              <strong>{district.district}</strong>: score {district.opportunityScore}/100, {district.nearbyCompetitors} nearby competitors.
            </p>
          )) : <p>No district recommendation was returned by the analytics engine.</p>}
        </div>
        <div className="consultantEvidenceBlock">
          <span>Risk factors</span>
          {risks.length ? risks.slice(0, 3).map((risk) => (
            <p key={`${risk.label}-${risk.level}`}>
              <strong>{risk.label}</strong>: {risk.level}. {risk.evidence}
            </p>
          )) : <p>No structured risk factor was returned for this answer.</p>}
        </div>
      </div>
    </div>
  );
}

function DistrictRecommendationChart({ districts }) {
  const maxScore = Math.max(1, ...districts.slice(0, 4).map((district) => Number(district.opportunityScore) || 0));

  return (
    <div className="inlineChartCard">
      <span>District recommendations</span>
      {districts.slice(0, 4).map((district) => (
        <div className="inlineBarRow" key={district.district}>
          <small>{district.district}</small>
          <div><i style={{ width: `${Math.max(8, ((Number(district.opportunityScore) || 0) / maxScore) * 100)}%` }} /></div>
          <strong>{district.opportunityScore}/100</strong>
        </div>
      ))}
    </div>
  );
}

function SimulationChart({ simulation }) {
  return (
    <div className="inlineChartCard simulationChart">
      <span>Probability simulation</span>
      <div className="simulationBars">
        <div>
          <small>{simulation.before.scenario || simulation.before.label}</small>
          <strong>{simulation.before.successProbability}%</strong>
          <em>{simulation.before.risk}</em>
          <i style={{ height: `${Math.max(10, simulation.before.successProbability)}%` }} />
        </div>
        <div>
          <small>{simulation.after.scenario || simulation.after.label}</small>
          <strong>{simulation.after.successProbability}%</strong>
          <em>{simulation.after.risk}</em>
          <i style={{ height: `${Math.max(10, simulation.after.successProbability)}%` }} />
        </div>
      </div>
      <p>{simulation.probabilityDelta.explanation}</p>
    </div>
  );
}

function BoiScoreCard({ boi }) {
  const drivers = boi.drivers || {};

  return (
    <div className="boiScoreCard">
      <div>
        <span>BOI Score</span>
        <strong>{boi.score}/100</strong>
        <small>{boi.label}</small>
      </div>
      <div className="boiDriverGrid">
        {Object.entries(drivers).map(([driver, value]) => (
          <article key={driver}>
            <span>{formatFactorName(driver)}</span>
            <strong>{value}/100</strong>
          </article>
        ))}
      </div>
      <p>{boi.explanation}</p>
    </div>
  );
}

function MarketGapEnginePanel({ engine }) {
  const detections = engine.detections || {};
  const signals = [
    ...(detections.missingCategories || []).map((item) => ({ ...item, group: "Missing category" })),
    ...(detections.underservedPricingSegments || []).map((item) => ({ ...item, group: "Pricing gap" })),
    ...(detections.weakMarketCoverage || []).map((item) => ({ ...item, group: "Weak coverage" })),
    ...(detections.unmetDemandIndicators || []).map((item) => ({ ...item, group: "Unmet demand" }))
  ].sort((left, right) => Number(right.score || 0) - Number(left.score || 0));

  if (!signals.length) {
    return null;
  }

  return (
    <div className="marketGapPanel">
      <span>Market gap engine</span>
      <div className="marketGapSignalGrid">
        {signals.slice(0, 6).map((signal) => (
          <article key={`${signal.group}-${signal.category || signal.segment || signal.district || signal.evidence}`}>
            <small>{signal.group}</small>
            <strong>{signal.category || signal.segment || signal.district || signal.type}</strong>
            <em>{signal.score}/100</em>
            <p>{signal.evidence}</p>
            <p>{signal.whyItMatters}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function StrategicAdvisorPanel({ advisor }) {
  return (
    <div className="strategicAdvisorPanel">
      <span>Strategic advisor</span>
      <strong>{formatFactorName(advisor.stance || "advisor")}</strong>
      <p>{advisor.challenge}</p>
      {advisor.pivots?.length ? (
        <div className="pivotList">
          {advisor.pivots.slice(0, 4).map((pivot) => (
            <article key={`${pivot.type}-${pivot.recommendation}`}>
              <span>{formatFactorName(pivot.type)}</span>
              <strong>{pivot.recommendation}</strong>
              <p>{pivot.why}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OpportunityCardGrid({ cards }) {
  return (
    <div className="opportunityCardGrid">
      {cards.map((card) => (
        <article key={`${card.label}-${card.value}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.signal}</small>
          <p>{card.evidence}</p>
        </article>
      ))}
    </div>
  );
}

function PricingSummaryCard({ pricing }) {
  return (
    <div className="dynamicEvidenceCard">
      <span>Pricing summary</span>
      <dl>
        <div><dt>Evidence</dt><dd>{pricing.evidence}</dd></div>
        <div><dt>Samples</dt><dd>{pricing.sampleCount}</dd></div>
        <div><dt>Average</dt><dd>{pricing.averagePrice ? `${formatMoney(pricing.averagePrice)} KZT` : "n/a"}</dd></div>
        <div><dt>Suggested</dt><dd>{pricing.suggestedPrice ? `${formatMoney(pricing.suggestedPrice)} KZT` : "n/a"}</dd></div>
      </dl>
      <p><strong>{pricing.pricingRisk}</strong>: {pricing.commercialRead}</p>
    </div>
  );
}

function SaturationIndicatorCard({ indicators }) {
  return (
    <div className="dynamicEvidenceCard">
      <span>Saturation indicators</span>
      <div className="saturationIndicatorList">
        {indicators.slice(0, 4).map((indicator) => (
          <article className={`saturationPill ${String(indicator.severity || "").toLowerCase()}`} key={indicator.district}>
            <strong>{indicator.district}</strong>
            <small>{indicator.severity} - {indicator.nearbyCompetitors} nearby</small>
            <p>{indicator.commercialRead}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function DistrictComparisonTable({ rows }) {
  return (
    <div className="districtComparisonTable">
      <span>District comparison</span>
      <table>
        <thead>
          <tr>
            <th>District</th>
            <th>Score</th>
            <th>Risk</th>
            <th>Opportunity</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row) => (
            <tr key={row.district}>
              <td>{row.district}</td>
              <td>{row.opportunityScore}/100</td>
              <td>{row.saturationLevel}</td>
              <td>{row.underservedScore ?? "n/a"}/100 underserved</td>
              <td>{row.commercialRead}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskSummaryGrid({ risks }) {
  return (
    <div className="riskSummaryGrid">
      {risks.slice(0, 4).map((risk) => (
        <article key={`${risk.label}-${risk.level}`}>
          <span>{risk.label}</span>
          <strong>{risk.level}</strong>
          <p>{risk.evidence}</p>
          <small>{risk.commercialImpact}</small>
        </article>
      ))}
    </div>
  );
}

function extractConsultantIntelligence(payload) {
  if (!payload) {
    return null;
  }

  return {
    insights: payload.insights || [],
    confidenceScore: payload.confidenceScore ?? 0,
    confidenceLevel: payload.confidenceLevel || payload.aiConfidence?.label || null,
    aiConfidence: payload.aiConfidence || null,
    linkedAnalytics: payload.linkedAnalytics || null,
    recommendedDistricts: payload.recommendedDistricts || [],
    riskFactors: payload.riskFactors || [],
    underservedMarketDetection: payload.underservedMarketDetection || payload.linkedAnalytics?.marketIntelligence?.underservedMarketDetection || [],
    comparativeSimulations: payload.comparativeSimulations || payload.linkedAnalytics?.marketIntelligence?.comparativeSimulations || [],
    opportunityCards: payload.opportunityCards || payload.linkedAnalytics?.marketIntelligence?.opportunityCards || [],
    riskSummaries: payload.riskSummaries || payload.linkedAnalytics?.marketIntelligence?.riskSummaries || [],
    districtComparison: payload.districtComparison || payload.linkedAnalytics?.marketIntelligence?.districtComparison || [],
    pricingSummary: payload.pricingSummary || payload.linkedAnalytics?.marketIntelligence?.pricingSummary || null,
    saturationIndicators: payload.saturationIndicators || payload.linkedAnalytics?.marketIntelligence?.saturationIndicators || [],
    marketGapEngine: payload.marketGapEngine || payload.linkedAnalytics?.marketIntelligence?.marketGapEngine || payload.linkedAnalytics?.marketGapEngine || null,
    boiScore: payload.boiScore || payload.linkedAnalytics?.marketIntelligence?.boiScore || null,
    strategicAdvisor: payload.strategicAdvisor || payload.linkedAnalytics?.marketIntelligence?.strategicAdvisor || null,
    intent: payload.intent || null,
    provider: payload.provider || null,
    dataSources: payload.dataSources || null
  };
}

function getConsultantQuickActions(result) {
  const district = result?.recommendation?.bestArea || "the top-ranked district";
  const city = result?.input?.city || "the selected city";
  const businessType = result?.profile?.title || formatBusinessType(result?.input?.businessType);

  return [
    {
      label: "Analyze My Budget",
      hint: "capital realism",
      icon: Calculator,
      prompt: `Analyze my budget for ${businessType} in ${city}. Explain low-budget risk, runway, break-even, and whether the budget is enough.`
    },
    {
      label: "Challenge Plan",
      hint: "advisor mode",
      icon: ShieldCheck,
      prompt: `Challenge this ${businessType} plan in ${city}. Explain weak assumptions, BOI, risks, pivots, and lower-risk alternatives.`
    },
    {
      label: "Find Best District",
      hint: "geo ranking",
      icon: MapPinned,
      prompt: `Find the best district for ${businessType} in ${city}. Use district scores, saturation, traffic, and nearby competitors.`
    },
    {
      label: "Detect Market Gaps",
      hint: "white space",
      icon: Target,
      prompt: `Detect market gaps for ${businessType} in ${city}. Use underserved demand, weak competition, and pricing coverage.`
    },
    {
      label: "Suggest Pivots",
      hint: "alternatives",
      icon: Sparkles,
      prompt: `Suggest pivots and alternatives for ${businessType} in ${city}. Compare startup risk against the current budget and recommend the safest next move.`
    },
    {
      label: "Compare Districts",
      hint: "simulation",
      icon: Table2,
      prompt: `Compare districts for ${businessType} in ${city}. Include a before and after optimization simulation and explain probability changes.`
    },
    {
      label: "Predict Profitability",
      hint: "forecast",
      icon: TrendingUp,
      prompt: `Predict profitability for ${businessType} in ${city}. Explain revenue, net profit, break-even, payback, and pricing risk.`
    },
    {
      label: "Generate SWOT Analysis",
      hint: "strategy",
      icon: ShieldCheck,
      prompt: `Generate a SWOT analysis for ${businessType} in ${city}. Use only the loaded platform analytics and risk modules.`
    },
    {
      label: "Find Underserved Areas",
      hint: "demand gaps",
      icon: Search,
      prompt: `Find underserved areas for ${businessType} in ${city}. Prioritize weak competition, demand, saturation, and ${district}.`
    }
  ];
}

function WorkflowList({ title, items, getLabel, getDetail }) {
  return (
    <div className="workflowList">
      <span>{title}</span>
      {items?.length ? items.slice(0, 4).map((item, index) => (
        <div key={`${title}-${getLabel(item)}-${index}`}>
          <strong>{getLabel(item)}</strong>
          <small>{getDetail(item)}</small>
        </div>
      )) : <small>No confirmed records in current analytics.</small>}
    </div>
  );
}

function WorkflowMetric({ label, value, detail }) {
  return (
    <div className="workflowMetric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail || "No explanation was returned by the analytics engine."}</small>
    </div>
  );
}

function buildConsultantOpening(result) {
  return "Gemini is ready. Ask a question about your analysis or start a general conversation.";
}

function createMessageId(role) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
