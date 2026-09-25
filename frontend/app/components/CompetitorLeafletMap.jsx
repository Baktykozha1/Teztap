"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { AccessGate, useAccess } from "../../components/access-provider";
import { scoreListing } from "../../lib/discovery";

const tileLayerUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const emptyHighlights = [];

export default function CompetitorLeafletMap({ result, plannedBusinesses = [], properties = [], listings = [], variant = "market", selectedLocation = null, onLocationSelect, searchOrigin = null, onSearchOriginChange, selectedListingId = null, highlightedListingIds = emptyHighlights, onListingSelect, radiusKm = 10, autoLocateKey = null, isVisible = true }) {
  const { can } = useAccess();
  const advanced = can("OPPORTUNITY_SCORE");
  const plansAllowed = can("PLANNED_BUSINESS");
  const propertiesAllowed = can("COMMERCIAL_PROPERTIES");
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const onSearchOriginChangeRef = useRef(onSearchOriginChange);
  const onListingSelectRef = useRef(onListingSelect);
  const [activeDistrict, setActiveDistrict] = useState(null);
  const [mapStatus, setMapStatus] = useState("loading");
  const [locationMessage, setLocationMessage] = useState("");
  const [visibleStatuses, setVisibleStatuses] = useState({
    EXISTING: true,
    PLANNED: true,
    VERIFIED: true,
    OPEN: true
  });

  const competitors = useMemo(
    () => (result?.competitors || []).filter((competitor) => hasValidCoordinates(competitor.coordinates)),
    [result]
  );
  const areas = useMemo(
    () => (advanced ? result?.opportunityAreas || [] : []).filter((area) => hasValidCoordinates(area.coordinates)),
    [result, advanced]
  );
  const plannedMarkers = useMemo(
    () => (plansAllowed ? (plannedBusinesses.length ? plannedBusinesses : result?.plannedBusinesses || []) : []).filter((item) => hasValidCoordinates(item.coordinates || { lat: item.latitude, lng: item.longitude })),
    [plannedBusinesses, result, plansAllowed]
  );
  const propertyMarkers = useMemo(
    () => (propertiesAllowed ? properties || [] : []).filter((item) => hasValidCoordinates(item.coordinates || { lat: item.latitude, lng: item.longitude })),
    [properties, propertiesAllowed]
  );
  const listingMarkers = useMemo(
    () => (variant === "directory" ? listings || [] : []).filter((item) => hasValidCoordinates(item.coordinates || { lat: item.latitude, lng: item.longitude })),
    [listings, variant]
  );
  const highlightedRanks = useMemo(() => new Map(highlightedListingIds.slice(0, 3).map((id, index) => [id, index + 1])), [highlightedListingIds]);
  const areaLookup = useMemo(() => new Map(areas.map((area) => [area.name, area])), [areas]);
  const topAreas = useMemo(() => areas.slice(0, 4), [areas]);
  const heatLayers = useMemo(() => buildHeatLayers(areas), [areas]);
  const districtOpportunityDetections = useMemo(
    () => result?.opportunityDiscovery?.districtOpportunityDetection || [],
    [result]
  );
  const activeOpportunity = useMemo(() => {
    if (!activeDistrict) {
      return null;
    }

    return districtOpportunityDetections.find((item) => item.district === activeDistrict) || null;
  }, [activeDistrict, districtOpportunityDetections]);
  const hasLayerData = competitors.length > 0 || areas.length > 0 || plannedMarkers.length > 0 || propertyMarkers.length > 0 || listingMarkers.length > 0;

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Геолокация недоступна в этом браузере.");
      return;
    }
    setLocationMessage("Определяем ваше местоположение…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { coordinates: { lat: coords.latitude, lng: coords.longitude }, address: "Ваше местоположение", districtId: null };
        onSearchOriginChangeRef.current?.(point);
        setLocationMessage("Показываем места рядом с вами.");
        mapRef.current?.flyTo([coords.latitude, coords.longitude], 14, { animate: true, duration: 0.65 });
      },
      (error) => {
        if (error.code === 1) setLocationMessage("Доступ к геолокации запрещён. Выберите точку на карте.");
        else if (error.code === 2) setLocationMessage("Не удалось определить местоположение. Выберите точку на карте.");
        else setLocationMessage("Поиск местоположения занял слишком много времени. Попробуйте ещё раз.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (variant === "directory" && autoLocateKey) locateUser();
  }, [autoLocateKey, locateUser, variant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isVisible) return undefined;
    const timer = window.setTimeout(() => map.invalidateSize({ pan: false }), 100);
    return () => window.clearTimeout(timer);
  }, [isVisible]);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    onSearchOriginChangeRef.current = onSearchOriginChange;
    onListingSelectRef.current = onListingSelect;
  }, [onSearchOriginChange, onListingSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const center = result?.market?.map?.center || { lat: 43.6532, lng: 51.1975 };
    let map;
    try {
      map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        preferCanvas: false
      }).setView([center.lat, center.lng], 13);
    } catch {
      setMapStatus("error");
      return undefined;
    }

    let receivedTiles = false;
    const tileLayer = L.tileLayer(tileLayerUrl, { attribution: "&copy; OpenStreetMap contributors" });
    tileLayer.on("tileload", () => { receivedTiles = true; setMapStatus("ready"); });
    tileLayer.on("tileerror", () => { if (!receivedTiles) setMapStatus("error"); });
    tileLayer.addTo(map);
    const providerTimer = window.setTimeout(() => { if (!receivedTiles) setMapStatus("error"); }, 12000);

    const overlayLayer = L.layerGroup();
    const highlightLayer = L.layerGroup();
    const markerLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 46,
      chunkedLoading: true,
      chunkInterval: 120,
      chunkDelay: 30,
      iconCreateFunction: createClusterIcon
    });

    overlayLayer.addTo(map);
    markerLayer.addTo(map);
    highlightLayer.addTo(map);
    mapRef.current = map;
    markerLayerRef.current = markerLayer;
    highlightLayerRef.current = highlightLayer;
    overlayLayerRef.current = overlayLayer;

    const resizeTimer = window.setTimeout(() => {
      if (mapRef.current === map) {
        map.invalidateSize();
      }
    }, 80);

    return () => {
      window.clearTimeout(resizeTimer);
      window.clearTimeout(providerTimer);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      highlightLayerRef.current = null;
      overlayLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const handleClick = (event) => {
      const district = findNearestArea(event.latlng, areas);
      const point = {
        coordinates: { lat: event.latlng.lat, lng: event.latlng.lng },
        address: district ? `${district.name}, Актау` : "Выбранная точка, Актау",
        districtId: district?.name || null
      };
      if (variant === "directory") {
        onSearchOriginChangeRef.current?.(point);
        setLocationMessage("Центр поиска обновлён. Выберите подходящий радиус.");
      } else {
        onLocationSelectRef.current?.(point);
      }
    };

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [areas, variant]);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const highlightLayer = highlightLayerRef.current;
    const overlayLayer = overlayLayerRef.current;

    if (!map || !markerLayer || !highlightLayer || !overlayLayer) {
      return;
    }

    map.stop();
    markerLayer.clearLayers();
    highlightLayer.clearLayers();
    overlayLayer.clearLayers();

    areas.forEach((area, index) => {
      const color = getHeatColor(area);
      const intensity = getHeatIntensity(area);
      const areaPoint = toLatLng(area.coordinates);

      L.circle(areaPoint, {
        radius: 420 + intensity * 3.4,
        color,
        weight: 0,
        opacity: 0,
        fillColor: color,
        fillOpacity: 0.07 + intensity / 900
      }).addTo(overlayLayer);

      const zone = L.circle(areaPoint, {
        radius: 610 + Math.max(0, area.score - 50) * 4,
        color,
        weight: index === 0 ? 3 : 2,
        opacity: 0.82,
        fillColor: color,
        fillOpacity: area.saturation === "high" ? 0.16 : index === 0 ? 0.2 : 0.12,
        className: index === 0 ? "opportunityZone bestZone" : "opportunityZone"
      }).addTo(overlayLayer);

      zone.bindTooltip(createAreaTooltip(area), {
        sticky: true,
        direction: "top",
        className: "mapAnalyticsTooltip"
      });
      zone.bindPopup(createAreaPopup(area, index));
      zone.on("mouseover", () => zone.setStyle({ weight: 4, fillOpacity: 0.24 }));
      zone.on("mouseout", () => zone.setStyle({ weight: index === 0 ? 3 : 2, fillOpacity: index === 0 ? 0.18 : 0.1 }));
      zone.on("click", () => selectDistrict(area));
    });

    if (variant === "directory" && hasValidCoordinates(searchOrigin?.coordinates)) {
      const origin = toLatLng(searchOrigin.coordinates);
      L.circle(origin, { radius: Math.max(1, Number(radiusKm) || 1) * 1000, color: "#087e75", weight: 2, dashArray: "6 6", fillColor: "#20b895", fillOpacity: 0.07, interactive: false }).addTo(overlayLayer);
      L.circleMarker(origin, { radius: 7, color: "#fff", weight: 3, fillColor: "#087e75", fillOpacity: 1 }).bindTooltip("Центр поиска").addTo(overlayLayer);
    }

    if (visibleStatuses.EXISTING) competitors.forEach((competitor) => {
      const area = areaLookup.get(competitor.area);
      const color = area ? getHeatColor(area) : "#ef4444";
      const competitorPoint = toLatLng(competitor.coordinates);

      if (advanced) L.circle(competitorPoint, {
        radius: 260,
        color,
        weight: 1,
        opacity: 0.28,
        fillColor: color,
        fillOpacity: 0.07,
        className: "competitorHeat"
      }).addTo(overlayLayer);

      const marker = L.marker(competitorPoint, {
        icon: createDivIcon("competitor", color)
      });
      marker.bindPopup(createCompetitorPopup(competitor, result));
      marker.bindTooltip(createCompetitorTooltip(competitor, area), {
        sticky: true,
        className: "mapAnalyticsTooltip"
      });
      markerLayer.addLayer(marker);
    });

    plannedMarkers
      .filter((plan) => visibleStatuses[plan.status || "PLANNED"])
      .forEach((plan) => {
        const point = toLatLng(plan.coordinates || { lat: plan.latitude, lng: plan.longitude });
        const marker = L.marker(point, {
          icon: createDivIcon(String(plan.status || "PLANNED").toLowerCase(), getPlanColor(plan.status))
        });
        marker.bindPopup(createPlannedBusinessPopup(plan, result));
        marker.bindTooltip(createPlannedBusinessTooltip(plan), {
          sticky: true,
          className: "mapAnalyticsTooltip"
        });
        markerLayer.addLayer(marker);
      });

    propertyMarkers.forEach((property) => {
      const point = toLatLng(property.coordinates || { lat: property.latitude, lng: property.longitude });
      const marker = L.marker(point, { icon: createDivIcon("property", property.transactionType === "SALE" ? "#a78bfa" : "#22d3ee") });
      marker.bindPopup(createPropertyPopup(property));
      marker.bindTooltip(createPropertyTooltip(property), { sticky: true, className: "mapAnalyticsTooltip" });
      marker.on("click", () => onLocationSelectRef.current?.({ propertyId: property.id, coordinates: property.coordinates || { lat: property.latitude, lng: property.longitude }, address: property.address, districtId: property.districtId || null }));
      markerLayer.addLayer(marker);
    });

    listingMarkers.forEach((listing) => {
      const point = toLatLng(listing.coordinates || { lat: listing.latitude, lng: listing.longitude });
      const rank = highlightedRanks.get(listing.id) || null;
      const markerType = `discovery ${listing.id === selectedListingId ? "selected" : ""} ${rank ? "topChoice" : ""}`;
      const marker = L.marker(point, { icon: createDivIcon(markerType, getListingColor(listing.category), rank) });
      marker.options.discoveryId = listing.id;
      marker.options.discoveryCategory = listing.category;
      marker.options.discoveryRank = rank;
      marker.bindPopup(createDiscoveryPopup(listing, { center: searchOrigin?.coordinates, radiusKm, rank }));
      marker.bindTooltip(`${escapeHtml(listing.title)} · ${escapeHtml(listing.district || "Aktau")}`, { sticky: true, className: "mapAnalyticsTooltip" });
      marker.on("click", () => onListingSelectRef.current?.(listing));
      (rank ? highlightLayer : markerLayer).addLayer(marker);
    });

    areas.forEach((area, index) => {
      const marker = L.marker(toLatLng(area.coordinates), {
        icon: createAreaIcon(index === 0 ? "best" : "area", area.score, getHeatColor(area))
      });
      marker.bindPopup(createAreaPopup(area, index));
      marker.bindTooltip(createAreaTooltip(area), {
        sticky: true,
        className: "mapAnalyticsTooltip"
      });
      marker.on("click", () => selectDistrict(area));
      markerLayer.addLayer(marker);
    });

    const bounds = createBounds([...competitors, ...areas, ...plannedMarkers.map((item) => ({ coordinates: item.coordinates || { lat: item.latitude, lng: item.longitude } })), ...propertyMarkers.map((item) => ({ coordinates: item.coordinates || { lat: item.latitude, lng: item.longitude } })), ...listingMarkers.map((item) => ({ coordinates: item.coordinates || { lat: item.latitude, lng: item.longitude } }))]);

    if (variant !== "directory" && bounds) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
    } else if (variant !== "directory" && result?.market?.map?.center) {
      map.setView([result.market.map.center.lat, result.market.map.center.lng], 13);
    }

    const resizeTimer = window.setTimeout(() => {
      if (mapRef.current === map) {
        map.invalidateSize();
      }
    }, 80);

    return () => window.clearTimeout(resizeTimer);
  }, [areaLookup, areas, competitors, highlightedRanks, listingMarkers, plannedMarkers, propertyMarkers, result, visibleStatuses, variant, searchOrigin, radiusKm]);

  useEffect(() => {
    if (variant !== "directory") return;
    [...(markerLayerRef.current?.getLayers() || []), ...(highlightLayerRef.current?.getLayers() || [])].forEach((marker) => {
      if (!marker.options.discoveryId) return;
      const selected = marker.options.discoveryId === selectedListingId;
      marker.setIcon(createDivIcon(`discovery ${selected ? "selected" : ""} ${marker.options.discoveryRank ? "topChoice" : ""}`, getListingColor(marker.options.discoveryCategory), marker.options.discoveryRank));
    });
  }, [selectedListingId, variant]);

  useEffect(() => {
    if (activeDistrict && !areas.some((area) => area.name === activeDistrict)) {
      setActiveDistrict(null);
    }
  }, [activeDistrict, areas]);

  useEffect(() => {
    const map = mapRef.current;
    const coordinates = selectedLocation?.coordinates;
    if (!map || !hasValidCoordinates(coordinates)) return;

    if (selectedLocation.districtId) {
      setActiveDistrict(selectedLocation.districtId);
    }
    map.flyTo(toLatLng(coordinates), Math.max(map.getZoom(), 14), {
      animate: true,
      duration: 0.65
    });
  }, [selectedLocation]);

  return (
    <div className="leafletShell">
      <div className="mapCanvasWrap">
        <div ref={containerRef} className="leafletMap" aria-label={variant === "directory" ? `${result?.input?.city || "Aktau"} local listings map` : `${result?.input?.city || "Selected city"} competitor map`} />
        {variant === "directory" && <div className="aktauMapControls">
          <button type="button" onClick={locateUser} aria-label="Найти меня на карте"><span aria-hidden="true">◎</span> Моё местоположение</button>
          <span>Нажмите на карту, чтобы выбрать центр поиска</span>
        </div>}
        {variant === "directory" && mapStatus === "loading" && <div className="aktauMapStatus" role="status">Загружаем карту Актау…</div>}
        {variant === "directory" && mapStatus === "error" && <div className="aktauMapStatus error" role="status">Не удалось загрузить карту. Проверьте подключение к интернету.</div>}
        {variant === "directory" && locationMessage && <div className="aktauLocationMessage" role="status">{locationMessage}</div>}
        {!hasLayerData ? (
          <div className="mapOverlayState" role="status">
            <strong>{variant === "directory" ? "Нет объектов на карте" : "No geocoded records"}</strong>
            <p>{variant === "directory" ? "Измените фильтры или радиус поиска. Карта Актау остаётся доступной." : "The analysis did not return valid competitor or district coordinates for this map."}</p>
          </div>
        ) : null}
      </div>
      <div className="mapLegend leafletLegend">
        {variant === "directory" ? <>
          <div className="mapIntelHeader"><strong>Каталог Актау</strong><span>{listingMarkers.length} объектов на карте{highlightedListingIds.length ? " · 1–3 выбор TezTap" : ""}</span></div>
          <div className="aktauCategoryLegend"><span><i style={{ background: "#4d9de0" }} />Образование</span><span><i style={{ background: "#e7a83e" }} />Работа</span><span><i style={{ background: "#ea7580" }} />Услуги</span><span><i style={{ background: "#8d72dc" }} />Маркетплейс</span><span><i style={{ background: "#25a884" }} />Места</span>{listingMarkers.some((item) => item.category?.startsWith("neighborhood")) && <span><i style={{ background: "#e46a52" }} />Мой район</span>}</div>
          <p>{listingMarkers.some((item) => item.category?.startsWith("neighborhood")) ? "Выберите метку района или дома, чтобы открыть сообщество. Демо-адреса отмечены отдельно." : "Выберите метку, чтобы увидеть объект на общей карте TezTap."}</p>
        </> : <>
        <div className="mapIntelHeader">
          <strong>Geo-intelligence layers</strong>
          <span>{result?.market?.competitorCount != null ? `${result.market.competitorCount} competitors tracked` : "Competitor count unavailable"}</span>
        </div>
        <div>
          <span className="legendDot competitorDot" />
          Smart competitor markers
        </div>
        {propertiesAllowed && <div>
          <span className="legendDot propertyDot" />
          Commercial properties ({propertyMarkers.length})
        </div>}
        <div className="mapFilterRow">
          {Object.entries(visibleStatuses).filter(([statusName]) => statusName === "EXISTING" || plansAllowed).map(([statusName, enabled]) => (
            <button
              key={statusName}
              type="button"
              className={enabled ? "active" : ""}
              onClick={() => setVisibleStatuses((current) => ({ ...current, [statusName]: !current[statusName] }))}
            >
              <span className={`legendDot ${statusName.toLowerCase()}Dot`} />
              {statusName}
            </button>
          ))}
        </div>
        {advanced ? <><div>
          <span className="legendDot opportunityDot" />
          Opportunity zones
        </div>
        <div>
          <span className="legendDot heatDot" />
          Saturation heatmap
        </div>
        <div>
          <span className="legendDot riskDot" />
          High saturation risk
        </div>
        <p>Heatmaps recalculate from the current analysis: green is opportunity, yellow is medium competition, red is oversaturated.</p>
        <p>Click the map to choose another planned-business location.</p>
        {heatLayers.length ? (
        <div className="heatLayerStack">
          {heatLayers.map((layer) => (
            <article className={`heatLayer ${layer.tone}`} key={layer.label}>
              <span>{layer.label}</span>
              <strong>{layer.value}</strong>
              <small>{layer.detail}</small>
            </article>
          ))}
        </div>
        ) : <p className="sourceText">No geospatial heat layers were returned.</p>}
        {topAreas.length ? (
        <div className="districtIntelList">
          {topAreas.map((area, index) => (
            <button
              type="button"
              className={activeDistrict === area.name ? "active" : ""}
              key={area.name}
              onClick={() => focusDistrict(area)}
            >
              <span>{index + 1}</span>
              <strong>{area.name}</strong>
              <small>{area.score}/100 - {getHeatLabel(area)}</small>
            </button>
          ))}
        </div>
        ) : <p className="sourceText">No ranked districts were returned.</p>}
        <DistrictOpportunityBrief detection={activeOpportunity} />
        </> : <AccessGate compact feature="OPPORTUNITY_SCORE" />}
        </>}
      </div>
    </div>
  );

  function focusDistrict(area) {
    const map = mapRef.current;

    setActiveDistrict(area.name);
    onLocationSelectRef.current?.({
      coordinates: area.coordinates,
      address: area.name,
      districtId: area.name,
      opportunityScore: area.score
    });
    if (map && area.coordinates) {
      map.flyTo(toLatLng(area.coordinates), Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 0.8
      });
    }
  }

  function selectDistrict(area) {
    setActiveDistrict(area.name);
    onLocationSelectRef.current?.({
      coordinates: area.coordinates,
      address: area.name,
      districtId: area.name,
      opportunityScore: area.score
    });
  }
}

function DistrictOpportunityBrief({ detection }) {
  if (!detection) {
    return (
      <article className="districtOpportunityBrief empty">
        <span>District opportunity detection</span>
        <strong>Select a district zone</strong>
        <p>Click a ranked district on the map to reveal missing services, underserved categories, pricing gaps, required budget, and opportunity score from the current analysis.</p>
      </article>
    );
  }

  const missingServices = detection.missingServices || [];
  const underservedCategories = detection.underservedBusinessCategories || [];
  const pricingGaps = detection.pricingGaps || [];
  const marketOpportunities = detection.marketOpportunities || [];
  const riskFactors = detection.riskFactors || [];

  return (
    <article className="districtOpportunityBrief">
      <div className="districtOpportunityHeader">
        <span>District opportunity detection</span>
        <strong>{detection.district}</strong>
        <small>{detection.confidenceScore}/100 confidence</small>
      </div>
      <p>{detection.answerSummary?.answer || "No confirmed district opportunity signal was returned."}</p>
      <div className="districtOpportunityMetrics">
        <div>
          <span>Opportunity</span>
          <strong>{detection.opportunityScore}/100</strong>
        </div>
        <div>
          <span>Budget required</span>
          <strong>{formatMoney(detection.requiredBudget?.minimumViableBudget)} KZT</strong>
        </div>
        <div>
          <span>Competition</span>
          <strong>{detection.linkedAnalytics?.nearbyCompetitors ?? 0} nearby</strong>
        </div>
      </div>
      <OpportunityList title="Missing services" items={missingServices} getLabel={(item) => item.service} getDetail={(item) => item.evidence} />
      <OpportunityList title="Underserved categories" items={underservedCategories} getLabel={(item) => item.category} getDetail={(item) => item.evidence} />
      <OpportunityList title="Market opportunities" items={marketOpportunities} getLabel={(item) => item.title} getDetail={(item) => item.why} />
      <OpportunityList title="Pricing gaps" items={pricingGaps} getLabel={(item) => item.category || item.type} getDetail={(item) => item.evidence} />
      <OpportunityList title="Risk factors" items={riskFactors} getLabel={(item) => item.label} getDetail={(item) => item.evidence} />
    </article>
  );
}

function OpportunityList({ title, items, getLabel, getDetail }) {
  return (
    <div className="districtOpportunityList">
      <span>{title}</span>
      {items?.length ? (
        items.slice(0, 3).map((item, index) => (
          <div key={`${title}-${getLabel(item)}-${index}`}>
            <strong>{getLabel(item)}</strong>
            <small>{getDetail(item)}</small>
          </div>
        ))
      ) : (
        <small>No confirmed signal in current analytics.</small>
      )}
    </div>
  );
}

function createBounds(items) {
  const points = items
    .filter((item) => hasValidCoordinates(item.coordinates))
    .map((item) => toLatLng(item.coordinates));

  return points.length ? L.latLngBounds(points) : null;
}

function createDivIcon(type, color, rank = null) {
  const size = rank ? 32 : 26;
  return L.divIcon({
    className: "",
    html: `<span class="leafletCustomMarker ${type}" style="--marker-color:${escapeHtml(color || "#66a6ff")}">${rank ? escapeHtml(String(rank)) : ""}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, rank ? -16 : -14]
  });
}

function getListingColor(category) {
  return ({ education: "#4d9de0", jobs: "#e7a83e", services: "#ea7580", marketplace: "#8d72dc", places: "#25a884", neighborhood: "#e46a52", "neighborhood-alert": "#d93d3d" })[category] || "#7967f8";
}

function createAreaIcon(type, score, color) {
  return L.divIcon({
    className: "",
    html: `<span class="leafletAreaMarker ${type}" style="--marker-color:${escapeHtml(color || "#39d98a")}">${escapeHtml(String(score))}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20]
  });
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count >= 10 ? "large" : count >= 5 ? "medium" : "small";

  return L.divIcon({
    html: `<div><span>${count}</span></div>`,
    className: `marker-cluster marker-cluster-${size} smartCluster`,
    iconSize: L.point(42, 42)
  });
}

function createCompetitorPopup(competitor, result) {
  if (!result.opportunityScore) return `<article class="leafletPopup"><h3>${escapeHtml(competitor.name)}</h3><p>${escapeHtml(competitor.address || "")}</p><p>${escapeHtml(competitor.category || result.input?.businessType || "")}</p></article>`;
  const priceSamples = Array.isArray(competitor.priceSamples) ? competitor.priceSamples : [];
  const averagePrice = calculateAveragePrice(priceSamples);
  const area = (result.opportunityAreas || []).find((item) => item.name === competitor.area);
  const marketLevel = area?.saturation || result.market?.density || "unknown";
  const traffic = area?.footTraffic ? `${area.footTraffic}/100` : "not modeled";
  const prices = priceSamples.length
    ? priceSamples
        .map((sample) => `<li>${escapeHtml(sample.productName || sample.label)} -> <strong>${formatMoney(sample.price ?? sample.value)} KZT</strong></li>`)
        .join("")
    : `<li>${escapeHtml(competitor.sourceNote || "No verified public price samples")}</li>`;

  return `
    <article class="leafletPopup">
      <h3>${escapeHtml(competitor.name)}</h3>
      <p>${escapeHtml(competitor.address || "Address unavailable")}</p>
      <dl>
        <div><dt>Rating</dt><dd>${competitor.rating ? `${escapeHtml(String(competitor.rating))} (${formatMoney(competitor.ratingsCount)} reviews)` : "Not listed"}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(result.profile?.title || result.input?.businessType || "Business")}</dd></div>
        <div><dt>Avg pricing</dt><dd>${averagePrice != null ? `${formatMoney(averagePrice)} KZT` : "No verified samples"}</dd></div>
        <div><dt>Traffic</dt><dd>${escapeHtml(traffic)}</dd></div>
        <div><dt>Market level</dt><dd>${escapeHtml(marketLevel)}</dd></div>
      </dl>
      <div class="mapActionRow">Click district zones to compare saturation and opportunity drivers.</div>
      <ul>${prices}</ul>
    </article>
  `;
}

function createAreaPopup(area, index = 0) {
  return `
    <article class="leafletPopup">
      <h3>${escapeHtml(area.name)}</h3>
      <p>${escapeHtml(index === 0 ? `Top ranked opportunity zone. ${area.reason}` : area.reason)}</p>
      <dl>
        <div><dt>Score</dt><dd>${escapeHtml(String(area.score))}/100</dd></div>
        <div><dt>Nearby competitors</dt><dd>${escapeHtml(formatAreaMetric(area.competitorCountNearby))}</dd></div>
        <div><dt>Foot traffic</dt><dd>${escapeHtml(formatAreaMetric(area.footTraffic, true))}</dd></div>
        <div><dt>Underserved</dt><dd>${escapeHtml(formatAreaMetric(area.underservedScore, true))}</dd></div>
        <div><dt>Saturation</dt><dd>${escapeHtml(area.saturation)}</dd></div>
      </dl>
      <div class="mapActionRow">Click-to-analyze active: this district is now the focused zone.</div>
    </article>
  `;
}

function createAreaTooltip(area) {
  return `
    <div class="mapTooltipGrid">
      <strong>${escapeHtml(area.name)}</strong>
      <span>Opportunity ${escapeHtml(String(area.score))}/100</span>
      <span>Nearby competitors ${escapeHtml(formatAreaMetric(area.competitorCountNearby))}</span>
      <span>Saturation ${escapeHtml(area.saturation)}</span>
      <span>Underserved ${escapeHtml(formatAreaMetric(area.underservedScore, true))}</span>
    </div>
  `;
}

function createCompetitorTooltip(competitor, area) {
  return `
    <div class="mapTooltipGrid">
      <strong>${escapeHtml(competitor.name)}</strong>
      <span>${escapeHtml(competitor.area || "Unlisted district")}</span>
      <span>Rating ${competitor.rating ? escapeHtml(String(competitor.rating)) : "not listed"}</span>
      <span>Zone saturation ${escapeHtml(area?.saturation || "unknown")}</span>
    </div>
  `;
}

function createPlannedBusinessPopup(plan, result) {
  const projected = result?.projectedMarket || {};
  return `
    <article class="leafletPopup">
      <h3>${escapeHtml(formatBusinessType(plan.category))}</h3>
      <p>${escapeHtml(plan.address || plan.districtId || "Selected planned location")}</p>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(plan.status || "PLANNED")}</dd></div>
        <div><dt>Created</dt><dd>${escapeHtml(plan.createdAt ? new Date(plan.createdAt).toLocaleDateString() : "n/a")}</dd></div>
        <div><dt>Current competition</dt><dd>${escapeHtml(String(projected.existingCompetitors ?? result?.market?.competitorCount ?? 0))}</dd></div>
        <div><dt>Projected competition</dt><dd>${escapeHtml(String(projected.projectedCompetitors ?? "n/a"))}</dd></div>
        <div><dt>Future pressure</dt><dd>${escapeHtml(String(projected.futureMarketPressure ?? 0))}/100</dd></div>
      </dl>
      <div class="mapActionRow">Private owner data is hidden; this marker contributes only anonymized future-market impact.</div>
    </article>
  `;
}

function createPlannedBusinessTooltip(plan) {
  return `
    <div class="mapTooltipGrid">
      <strong>${escapeHtml(plan.status || "PLANNED")} business</strong>
      <span>${escapeHtml(formatBusinessType(plan.category))}</span>
      <span>${escapeHtml(plan.districtId || plan.address || "Selected map point")}</span>
    </div>
  `;
}

function createPropertyPopup(property) {
  const distanceKm = property.selectedDistanceKm ?? property.distanceKm;
  return `
    <article class="leafletPopup">
      <h3>${escapeHtml(property.title)}</h3>
      <p>${escapeHtml(property.address || "Address unavailable")}</p>
      <dl>
        <div><dt>Transaction</dt><dd>${escapeHtml(property.transactionType === "RENT" ? "For rent" : "For sale")}</dd></div>
        <div><dt>Price</dt><dd>${escapeHtml(formatMoney(property.price))} ${escapeHtml(property.currency || "KZT")}${property.transactionType === "RENT" ? " / month" : ""}</dd></div>
        <div><dt>Area</dt><dd>${escapeHtml(String(property.areaSqm))} m²</dd></div>
        <div><dt>Property fit</dt><dd>${escapeHtml(String(property.propertyFitScore ?? "n/a"))}/100</dd></div>
        <div><dt>Opportunity</dt><dd>${escapeHtml(String(property.marketFit?.opportunityScore ?? "n/a"))}/100</dd></div>
        <div><dt>Distance</dt><dd>${escapeHtml(distanceKm == null ? "n/a" : String(distanceKm) + " km")}</dd></div>
      </dl>
      <div class="mapActionRow">${escapeHtml(property.fitExplanation || "Fit is calculated from the current analysis.")}</div>
      <p>Source: ${property.sourceUrl ? `<a href="${escapeHtml(property.sourceUrl)}" target="_blank" rel="noreferrer">verified listing</a>` : escapeHtml(property.source || "unavailable")}</p>
    </article>
  `;
}

function createDiscoveryPopup(listing, context = {}) {
  if (listing.category === "neighborhood" || listing.category === "neighborhood-alert") {
    return `<article class="leafletPopup"><span class="discoveryPopupBadge">${escapeHtml(listing.sourceLabel || "Данные о районе")}</span><h3>${escapeHtml(listing.title)}</h3><p>${escapeHtml(listing.address || "Актау")}</p><p>${escapeHtml(listing.description || "Сообщество жителей")}</p><a class="discoveryDirections" href="/neighborhood/${encodeURIComponent(listing.id)}">Открыть сообщество ↗</a></article>`;
  }
  const item = scoreListing(listing, context);
  const point = listing.coordinates || { lat: listing.latitude, lng: listing.longitude };
  const directions = listing.category === "places"
    ? `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${point.lat},${point.lng}`)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
  return `
    <article class="leafletPopup">
      ${context.rank ? `<span class="discoveryPopupBadge">TezTap · топ ${escapeHtml(String(context.rank))}/3 · ${escapeHtml(item.recommendationAdvantages[0] || "по доступным данным")}</span>` : ""}
      <span class="discoveryPopupBadge">${listing.demo ? "ДЕМО · НЕ ПРОВЕРЕНО" : escapeHtml(listing.sourceLabel || "Публичные данные")}</span>
      <h3>${escapeHtml(listing.title)}</h3>
      <p>${escapeHtml(listing.provider)} · ${escapeHtml(listing.district || "Aktau")}</p>
      ${listing.category === "places" ? `<p>${escapeHtml(listing.address || "Адрес не указан")}</p>` : ""}
      <dl>
        <div><dt>Категория</dt><dd>${escapeHtml(listing.subtypeLabel || listing.subtype || listing.category)}</dd></div>
        <div><dt>Цена</dt><dd>${escapeHtml((listing.category === "places" ? listing.place?.priceRange : null) || listing.priceLabel || "Уточните стоимость")}</dd></div>
        ${listing.category === "places" ? `<div><dt>Часы</dt><dd>${escapeHtml(listing.openingHours || "Не указаны")}</dd></div>` : ""}
        <div><dt>Рейтинг</dt><dd>${listing.rating == null ? "Нет данных" : `${escapeHtml(String(listing.rating))}/5`}${listing.ratingCount == null ? " · отзывы неизвестны" : ` (${escapeHtml(String(listing.ratingCount))} ${listing.demo ? "демо-отзывов" : "отзывов"})`}</dd></div>
        <div><dt>Совпадение TezTap</dt><dd>${item.recommendationScore}/100</dd></div>
      </dl>
      <p class="discoveryPopupFactors">Факторы: ${item.recommendationFactors.map((factor) => `${escapeHtml(factor.label)} ${Math.round(factor.score)}/${factor.maxScore}`).join(" · ")}</p>
      <p>${escapeHtml(listing.description || "")}</p>
      <p>Источник: ${escapeHtml(listing.sourceLabel || (listing.demo ? "Демо-данные MVP · не подтверждено" : "не указан"))}${listing.lastUpdatedAt ? ` · обновлено ${escapeHtml(listing.lastUpdatedAt)}` : ""}</p>
      <a class="discoveryDirections" href="${escapeHtml(directions)}" target="_blank" rel="noreferrer">Построить маршрут ↗</a>
    </article>
  `;
}

function createPropertyTooltip(property) {
  return `
    <div class="mapTooltipGrid">
      <strong>${escapeHtml(property.title)}</strong>
      <span>${escapeHtml(property.transactionType === "RENT" ? "Rent" : "Sale")} - ${escapeHtml(formatMoney(property.price))} ${escapeHtml(property.currency || "KZT")}</span>
      <span>Fit ${escapeHtml(String(property.propertyFitScore ?? "n/a"))}/100</span>
    </div>
  `;
}

function getPlanColor(status) {
  const normalized = String(status || "PLANNED").toUpperCase();
  if (normalized === "VERIFIED") return "#3b82f6";
  if (normalized === "OPEN") return "#111827";
  if (normalized === "CANCELLED") return "#64748b";
  return "#f59e0b";
}

function findNearestArea(latlng, areas) {
  if (!areas.length) {
    return null;
  }

  return areas
    .filter((area) => hasValidCoordinates(area.coordinates))
    .map((area) => ({
      ...area,
      distance: distanceKm({ lat: latlng.lat, lng: latlng.lng }, area.coordinates)
    }))
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function getHeatColor(area) {
  if (area.saturation === "high" || area.competitorCountNearby >= 4) {
    return "#ef4444";
  }

  if (area.saturation === "medium" || area.competitorCountNearby >= 2 || area.score < 62) {
    return "#f59e0b";
  }

  return "#22c55e";
}

function getHeatLabel(area) {
  if (area.saturation === "high" || area.competitorCountNearby >= 4) {
    return "oversaturated";
  }

  if (area.saturation === "medium" || area.competitorCountNearby >= 2 || area.score < 62) {
    return "medium competition";
  }

  return "opportunity zone";
}

function getHeatIntensity(area) {
  const values = [
    metricContribution(area.competitorCountNearby, (value) => value * 18),
    metricContribution(area.underservedScore, (value) => (100 - value) * 0.28),
    metricContribution(area.footTraffic, (value) => value * 0.18),
    metricContribution(area.score, (value) => value * 0.12)
  ].filter(Number.isFinite);
  return Math.max(20, Math.min(100, values.reduce((sum, value) => sum + value, 0)));
}

function metricContribution(value, transform) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? transform(number) : null;
}

function formatAreaMetric(value, score = false) {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return "N/A";
  return `${Math.round(number)}${score ? "/100" : ""}`;
}

function buildHeatLayers(areas) {
  if (!areas.length) {
    return [];
  }

  const avg = (items, key) => {
    const values = items.map((item) => Number(item[key])).filter((value) => Number.isFinite(value));

    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const density = avg(areas, "competitorCountNearby");
  const opportunity = avg(areas, "score");
  const underserved = avg(areas, "underservedScore");
  const rentValues = areas.map((area) => Number(area.rentIndex)).filter((value) => Number.isFinite(value));
  const investment = rentValues.length ? Math.round(rentValues.reduce((sum, value) => sum + Math.max(0, 100 - value), 0) / rentValues.length) : null;

  return [
    density != null ? { label: "Competition density", value: `${density} avg`, detail: "nearby competitors", tone: density >= 3 ? "red" : density >= 2 ? "yellow" : "green" } : null,
    opportunity != null ? { label: "Opportunity zones", value: `${opportunity}/100`, detail: "mean district score", tone: opportunity >= 68 ? "green" : opportunity >= 55 ? "yellow" : "red" } : null,
    underserved != null ? { label: "Underserved areas", value: `${underserved}/100`, detail: "market gap signal", tone: underserved >= 68 ? "green" : underserved >= 50 ? "yellow" : "red" } : null,
    investment != null ? { label: "Investment attractiveness", value: `${investment}/100`, detail: "rent-adjusted fit", tone: investment >= 45 ? "green" : investment >= 30 ? "yellow" : "red" } : null
  ].filter(Boolean);
}

function calculateAveragePrice(samples) {
  if (!samples?.length) {
    return null;
  }

  const values = samples
    .map((sample) => Number(sample.value ?? sample.price))
    .filter((value) => Number.isFinite(value));

  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function hasValidCoordinates(coordinates) {
  if (!coordinates) {
    return false;
  }

  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function toLatLng(coordinates) {
  return [Number(coordinates.lat), Number(coordinates.lng)];
}

function distanceKm(left, right) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(right.lat) - Number(left.lat));
  const dLng = toRadians(Number(right.lng) - Number(left.lng));
  const lat1 = toRadians(Number(left.lat));
  const lat2 = toRadians(Number(right.lat));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function formatMoney(value) {
  const number = Number(value);

  return Number.isFinite(number) ? new Intl.NumberFormat("ru-RU").format(number) : "n/a";
}

function formatBusinessType(value) {
  return String(value || "business").replace(/^\w/, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
