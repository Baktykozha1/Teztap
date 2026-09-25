"use client";

import dynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import { useAccess, AccessGate } from "./access-provider";
import { accessCopy } from "../lib/access-copy";
import { formatBusinessType, formatMoney } from "../lib/formatters";

const Map = dynamic(() => import("../app/components/CompetitorLeafletMap"), { ssr: false, loading: () => <div className="mapLoading" /> });
export function BasicAnalysis({ result, selectedLocation, onLocationSelect }) {
  const { language } = useAccess();
  const t = accessCopy(language);
  return <div className="basicAnalysis">
    <section className="basicAnalysisHeader"><div><span className="eyebrow">BASIC</span><h2>{t.basic}</h2><p>{formatBusinessType(result.input?.businessType)} / {result.input?.city}</p></div><strong>{result.market?.competitorCount ?? result.competitors?.length ?? 0}<small>{t.competitors}</small></strong></section>
    <div className="accessToolbar"><span>{t.budget}: {formatMoney(result.input?.budget)} KZT</span><span>{result.meta?.generatedAt ? new Date(result.meta.generatedAt).toLocaleString(language) : ""}</span></div>
    <Map result={result} selectedLocation={selectedLocation} onLocationSelect={onLocationSelect} />
    {selectedLocation && <p><MapPinned size={15} /> {selectedLocation.address} ({selectedLocation.coordinates.lat.toFixed(5)}, {selectedLocation.coordinates.lng.toFixed(5)})</p>}
    <section className="basicAreaList"><h3>{t.distribution}</h3>{Object.entries(result.market?.areaCounts || {}).length ? Object.entries(result.market.areaCounts).map(([name, count]) => <div key={name}><span>{name}</span><strong>{count}</strong></div>) : <p>{t.empty}</p>}</section>
    <AccessGate compact feature="OPPORTUNITY_SCORE" />
    <AccessGate compact feature="AI_ADVISOR" />
  </div>;
}
