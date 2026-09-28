"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, LocateFixed, MapPin, RefreshCw, Route, TrafficCone } from "lucide-react";
import { PlatformPageShell } from "../../components/ui/platform-pages";

const AKTAU_CENTER = [51.1975, 43.6532];
const AKTAU_TIME_ZONE = "Asia/Almaty";

function aktauDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: AKTAU_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function aktauTime() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: AKTAU_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

function parseRouteLine(selection) {
  const match = typeof selection === "string" && /^LINESTRING\s*\((.+)\)$/i.exec(selection.trim());
  if (!match) return [];
  return match[1].split(",").map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter((pair) => pair.length >= 2 && pair.slice(0, 2).every(Number.isFinite))
    .map(([lng, lat]) => [lng, lat]);
}

function trafficColor(status) {
  switch (String(status || "").toLowerCase()) {
    case "fast":
    case "no-traffic": return "#20a66b";
    case "normal": return "#c7b52c";
    case "slow": return "#efad32";
    case "slow-jams": return "#e75e4b";
    case "ignore": return "#7386a0";
    default: return "#7386a0";
  }
}

function loadMapGL() {
  if (typeof window === "undefined") return Promise.reject(new Error("MapGL доступен только в браузере"));
  if (window.mapgl) return Promise.resolve(window.mapgl);
  if (window.__teztapMapglPromise) return window.__teztapMapglPromise;

  window.__teztapMapglPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://mapgl.2gis.com/api/js/v1";
    script.async = true;
    script.onload = () => window.mapgl ? resolve(window.mapgl) : reject(new Error("MapGL не инициализирован"));
    script.onerror = () => reject(new Error("Не удалось загрузить библиотеку карты 2ГИС"));
    document.head.appendChild(script);
  }).catch((error) => {
    window.__teztapMapglPromise = null;
    throw error;
  });

  return window.__teztapMapglPromise;
}

function TrafficMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [trafficOn, setTrafficOn] = useState(true);
  const [retry, setRetry] = useState(0);
  const [routePoints, setRoutePoints] = useState([null, null]);
  const [selectingPoint, setSelectingPoint] = useState("start");
  const [departureDate, setDepartureDate] = useState(() => aktauDate());
  const [departureTime, setDepartureTime] = useState(() => aktauTime());
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const selectionHandlerRef = useRef(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [projectedRoute, setProjectedRoute] = useState([]);
  const [projectedMarkers, setProjectedMarkers] = useState([]);

  selectionHandlerRef.current = (point) => {
    setRoutePoints((current) => {
      const next = [...current];
      next[selectingPoint === "start" ? 0 : 1] = point;
      return next;
    });
    setRouteResult(null);
    setRouteError("");
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus("loading");
    setMessage("");

    fetch("/api/twogis/mapgl-config", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Не удалось проверить настройки карты 2ГИС");
        if (!data.enabled || !data.key) {
          setStatus("missing-key");
          setMessage("Добавьте в переменные окружения сервера TWOGIS_MAPGL_KEY — ключ с доступом к Map Tiles API.");
          return null;
        }
        return data.key;
      })
      .then(async (key) => {
        if (!key || !active || !containerRef.current) return;
        const mapgl = await loadMapGL();
        if (!active || !containerRef.current) return;

        const map = new mapgl.Map(containerRef.current, {
          key,
          center: AKTAU_CENTER,
          zoom: 12,
          trafficControl: "topRight",
          trafficOn: true,
          disableZoomOnScroll: true,
          enableTwoFingerDragging: true
        });
        mapRef.current = map;
        const onStyleLoad = () => { if (active) setStatus("ready"); };
        const onMapError = () => {
          if (active) {
            setStatus("error");
            setMessage("2ГИС не загрузил карту. Проверьте доступ ключа к Map Tiles API, ограничения домена и подключение к интернету.");
          }
        };
        map.on?.("styleload", onStyleLoad);
        map.on?.("error", onMapError);
        map.on?.("click", ({ lngLat }) => {
          if (Array.isArray(lngLat) && lngLat.length >= 2) selectionHandlerRef.current?.({ lng: Number(lngLat[0]), lat: Number(lngLat[1]) });
        });
        window.setTimeout(() => {
          if (active && mapRef.current === map && status !== "ready") {
            setStatus((current) => current === "loading" ? "error" : current);
            setMessage((current) => current || "Карта долго не отвечает. Проверьте доступ ключа 2ГИС к Map Tiles API.");
          }
        }, 20000);
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") {
          setStatus("error");
          setMessage(error.message || "Не удалось загрузить карту пробок.");
        }
      });

    return () => {
      active = false;
      controller.abort();
      if (mapRef.current) {
        mapRef.current.destroy?.();
        mapRef.current = null;
      }
    };
  }, [retry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const segments = (routeResult?.geometry || []).map((segment) => {
      const selection = typeof segment === "string" ? segment : segment?.selection;
      return { coordinates: parseRouteLine(selection), color: trafficColor(typeof segment === "string" ? null : segment?.color) };
    }).filter((segment) => segment.coordinates.length > 1);
    const valid = routePoints.map((point) => point && [point.lng, point.lat]).filter(Boolean);
    const syncProjection = () => {
      const width = containerRef.current?.clientWidth || 0;
      const height = containerRef.current?.clientHeight || 0;
      setMapSize({ width, height });
      const snappedPoints = routeResult?.waypoints?.length >= 2 ? routeResult.waypoints : routePoints;
      setProjectedMarkers(snappedPoints.map((point) => {
        if (!point) return null;
        const projected = map.project([point.lng, point.lat]);
        return [projected[0], projected[1]];
      }));
      setProjectedRoute(segments.map((segment) => ({
        color: segment.color,
        points: segment.coordinates.map(([lng, lat]) => map.project([lng, lat]).slice(0, 2))
      })));
    };
    syncProjection();
    ["move", "zoom", "rotate", "pitch", "resize"].forEach((eventName) => map.on?.(eventName, syncProjection));
    const resizeObserver = typeof ResizeObserver !== "undefined" && containerRef.current ? new ResizeObserver(syncProjection) : null;
    resizeObserver?.observe(containerRef.current);
    if (valid.length) map.setCenter?.(valid[valid.length - 1]);
    return () => {
      ["move", "zoom", "rotate", "pitch", "resize"].forEach((eventName) => map.off?.(eventName, syncProjection));
      resizeObserver?.disconnect();
    };
  }, [routePoints, routeResult, status]);

  const toggleTraffic = useCallback(() => {
    const next = !trafficOn;
    if (next) mapRef.current?.showTraffic?.();
    else mapRef.current?.hideTraffic?.();
    setTrafficOn(next);
  }, [trafficOn]);

  const resetToAktau = useCallback(() => {
    mapRef.current?.setCenter?.(AKTAU_CENTER);
    mapRef.current?.setZoom?.(12);
  }, []);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setMessage("Этот браузер не поддерживает геолокацию.");
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      mapRef.current?.setCenter?.([coords.longitude, coords.latitude]);
      mapRef.current?.setZoom?.(15);
      setMessage("");
    }, () => setMessage("Не удалось получить местоположение. Разрешите доступ к геолокации в браузере."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }, []);

  const calculateTrafficForecast = useCallback(async () => {
    if (!routePoints[0] || !routePoints[1]) {
      setRouteError("Сначала выберите начало и пункт назначения: нажмите соответствующие кнопки и укажите точки на карте.");
      return;
    }
    // Aktau uses UTC+5; fixing the offset keeps results independent from the browser's timezone.
    const departureAt = Math.floor(new Date(`${departureDate}T${departureTime}:00+05:00`).getTime() / 1000);
    setRouteLoading(true);
    setRouteError("");
    setRouteResult(null);
    try {
      const response = await fetch("/api/twogis/traffic-route", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: routePoints, departureAt })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось рассчитать прогноз.");
      setRouteResult(data);
    } catch (error) {
      setRouteError(error.message || "Прогноз пробок сейчас недоступен.");
    } finally {
      setRouteLoading(false);
    }
  }, [routePoints, departureDate, departureTime]);

  const clearForecastRoute = useCallback(() => {
    setRoutePoints([null, null]);
    setRouteResult(null);
    setRouteError("");
  }, []);

  return (
    <section className="trafficExperience" aria-label="Карта пробок Актау">
      <header className="trafficToolbar">
        <div className="trafficLiveLabel"><span className={status === "ready" ? "trafficLiveDot" : "trafficLiveDot idle"} />{status === "ready" ? "Состояние дорог 2ГИС" : "Карта 2ГИС"}</div>
        <div className="trafficActions">
          <button type="button" onClick={resetToAktau} disabled={status !== "ready"}><LocateFixed size={16} /> Актау</button>
          <button type="button" onClick={useMyLocation} disabled={status !== "ready"}><LocateFixed size={16} /> Моё место</button>
          <button type="button" className={trafficOn ? "trafficToggle active" : "trafficToggle"} onClick={toggleTraffic} disabled={status !== "ready"} aria-pressed={trafficOn}><TrafficCone size={16} /> {trafficOn ? "Пробки включены" : "Показать пробки"}</button>
          <button type="button" aria-label="Перезагрузить карту" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /> Обновить</button>
        </div>
      </header>
      <div className="trafficForecastPanel">
        <div className="trafficForecastHeading"><Route size={18} /><div><strong>Пробки по времени</strong><span>Выберите две точки на карте и задайте время выезда</span></div></div>
        <div className="trafficRoutePickers">
          <button type="button" className={selectingPoint === "start" ? "selected" : ""} onClick={() => setSelectingPoint("start")}><MapPin size={15} /> Начало{routePoints[0] ? ` · ${routePoints[0].lat.toFixed(4)}, ${routePoints[0].lng.toFixed(4)}` : " · нажмите на карту"}</button>
          <button type="button" className={selectingPoint === "end" ? "selected" : ""} onClick={() => setSelectingPoint("end")}><MapPin size={15} /> Куда{routePoints[1] ? ` · ${routePoints[1].lat.toFixed(4)}, ${routePoints[1].lng.toFixed(4)}` : " · нажмите на карту"}</button>
        </div>
        <label className="trafficDateField"><CalendarClock size={16} /><span>День выезда</span><input aria-label="День выезда" type="date" min={aktauDate(-30)} max={aktauDate(7)} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
        <label className="trafficDateField"><Clock3 size={16} /><span>Время</span><input aria-label="Время выезда" type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} /></label>
        <button type="button" className="trafficForecastButton" onClick={calculateTrafficForecast} disabled={routeLoading}>{routeLoading ? <><span className="trafficSpinner small" /> Считаем…</> : <><Route size={16} /> Показать прогноз</>}</button>
        <button type="button" className="trafficClearButton" onClick={clearForecastRoute} disabled={!routePoints.some(Boolean) && !routeResult}>Сбросить маршрут</button>
        {routeError && <p className="trafficForecastError" role="alert">{routeError}</p>}
        {routeResult && <div className="trafficForecastResult" role="status"><strong>Прогноз на {departureDate} в {departureTime}</strong><span>Ориентировочное время в пути: <b>{routeResult.durationLabel || `${Math.ceil(routeResult.durationSeconds / 60)} мин.`}</b>{routeResult.distanceMeters ? ` · ${(routeResult.distanceMeters / 1000).toFixed(1)} км` : ""}</span><small>На карте выделен только выбранный маршрут. Цвет сегментов показывает оценку загруженности 2ГИС на заданное время: зелёный — свободнее, жёлтый — медленнее, красный — затруднённое движение. Синий полупрозрачный контур помогает видеть линию маршрута. Это статистический прогноз 2ГИС.</small></div>}
      </div>
      <div className="trafficMapFrame">
        <div ref={containerRef} className="trafficMapCanvas" />
        {(routePoints.some(Boolean) || routeResult) && <svg className="trafficRouteOverlay" viewBox={`0 0 ${mapSize.width} ${mapSize.height}`} role="img" aria-label="Выбранный маршрут на карте">
          {routeResult && projectedRoute.map((segment, index) => {
            const points = segment.points.map(([x, y]) => `${x},${y}`).join(" ");
            return <g key={`route-segment-${index}`}>
              <polyline points={points} fill="none" stroke="#1686d9" strokeOpacity="0.34" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={points} fill="none" stroke={segment.color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={points} fill="none" stroke="#1686d9" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" strokeLinejoin="round" />
            </g>;
          })}
          {projectedMarkers.map((point, index) => point && <circle key={index} cx={point[0]} cy={point[1]} r="9" fill={index === 0 ? "#087f70" : "#ef7d42"} stroke="#ffffff" strokeWidth="3" />)}
        </svg>}
        {status !== "ready" && <div className="trafficMapMessage" role={status === "error" ? "alert" : "status"}>
          {status === "loading" ? <><span className="trafficSpinner" /><strong>Загружаем карту Актау…</strong><span>Подключаем дорожный слой 2ГИС</span></> : <><AlertTriangle size={25} /><strong>{status === "missing-key" ? "Нужен отдельный ключ для карты 2ГИС" : "Карта пока недоступна"}</strong><span>{message}</span>{status === "error" && <button type="button" onClick={() => setRetry((value) => value + 1)}>Попробовать снова</button>}</>}
        </div>}
      </div>
      <footer className="trafficAttribution"><span>Дорожная обстановка предоставлена 2ГИС</span><a href="https://2gis.kz/aktau" target="_blank" rel="noreferrer">Открыть Актау в 2ГИС</a></footer>
      <p className="trafficNote">Пробки отображаются как дорожный слой 2ГИС. Доступность данных и обновление зависят от покрытия 2ГИС в городе и прав API-ключа. Прогноз по времени использует статистику 2ГИС только для выбранного маршрута; детальная карта исторических пробок за весь город не предоставляется.</p>
    </section>
  );
}

export default function TrafficPage() {
  return <PlatformPageShell eyebrow="Карта 2ГИС" title="Пробки в Актау" subtitle="Посмотрите текущую загруженность дорог на карте и при необходимости включите геолокацию."><TrafficMap /></PlatformPageShell>;
}
