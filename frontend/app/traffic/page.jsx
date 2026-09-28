"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, LocateFixed, RefreshCw, TrafficCone } from "lucide-react";
import { PlatformPageShell } from "../../components/ui/platform-pages";

const AKTAU_CENTER = [51.1975, 43.6532];

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
      <div className="trafficMapFrame">
        <div ref={containerRef} className="trafficMapCanvas" />
        {status !== "ready" && <div className="trafficMapMessage" role={status === "error" ? "alert" : "status"}>
          {status === "loading" ? <><span className="trafficSpinner" /><strong>Загружаем карту Актау…</strong><span>Подключаем дорожный слой 2ГИС</span></> : <><AlertTriangle size={25} /><strong>{status === "missing-key" ? "Нужен отдельный ключ для карты 2ГИС" : "Карта пока недоступна"}</strong><span>{message}</span>{status === "error" && <button type="button" onClick={() => setRetry((value) => value + 1)}>Попробовать снова</button>}</>}
        </div>}
      </div>
      <footer className="trafficAttribution"><span>Дорожная обстановка предоставлена 2ГИС</span><a href="https://2gis.kz/aktau" target="_blank" rel="noreferrer">Открыть Актау в 2ГИС</a></footer>
      <p className="trafficNote">Пробки отображаются как дорожный слой 2ГИС. Доступность данных и обновление зависят от покрытия 2ГИС в городе и прав API-ключа.</p>
    </section>
  );
}

export default function TrafficPage() {
  return <PlatformPageShell eyebrow="Карта 2ГИС" title="Пробки в Актау" subtitle="Посмотрите текущую загруженность дорог на карте и при необходимости включите геолокацию."><TrafficMap /></PlatformPageShell>;
}
