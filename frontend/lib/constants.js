import {
  Map as MapIcon,
  ShieldCheck,
  Target,
  TrendingUp
} from "lucide-react";

export const API_ANALYZE_URL = "/api/analyze-market";
export const API_HEALTH_URL = "/api/health";
export const API_OPTIONS_URL = "/api/options";
export const API_CHAT_STREAM_URL = "/api/chat/stream";
export const API_CHAT_URL = "/api/chat";
export const API_EXPORT_URL = "/api/export/report";

export const fallbackOptions = {
  cities: ["Aktau", "Almaty", "Astana"],
  businessTypes: ["grocery", "cafe", "coffee_shop", "pharmacy"],
  profiles: {},
  dataVersion: "local"
};

export const chartColors = Object.assign(
  ["#39d98a", "#66a6ff", "#ffb454", "#ff6b8a", "#9b8cff", "#2dd4bf"],
  {
    primary: "#66a6ff",
    success: "#39d98a",
    warning: "#ffb454",
    danger: "#ff6b8a",
    accent: "#9b8cff"
  }
);

export const metricIcons = {
  opportunity: Target,
  success: TrendingUp,
  confidence: ShieldCheck,
  district: MapIcon
};
