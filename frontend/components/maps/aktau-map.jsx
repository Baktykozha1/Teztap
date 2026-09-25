"use client";

import dynamic from "next/dynamic";

const LeafletAktauMap = dynamic(() => import("../../app/components/CompetitorLeafletMap"), {
  ssr: false,
  loading: () => <div className="mapLoading" role="status">Загружаем интерактивную карту Актау…</div>
});

/** Shared directory map backed by TezTap's existing clustered Leaflet map. */
/** @param {import("../../../shared/map").AktauMapProps} props */
export default function AktauMap(props) {
  return <LeafletAktauMap {...props} variant="directory" />;
}
