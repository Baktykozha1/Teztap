import directory from "../../data/discovery.js";
export const { categories, listings } = directory;

export async function loadGeographicListings({ category, center, radiusKm, query = "", page = 1, signal }) {
  const params = new URLSearchParams({ category, lat: String(center.lat), lng: String(center.lng), radiusKm: String(radiusKm), query, page: String(page) });
  const response = await fetch(`/api/discovery?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Geo search failed (${response.status})`);
  return response.json();
}

export async function geocodeAktau(query, signal) {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
  return response.json();
}

export async function reverseGeocodeAktau(coordinates, signal) {
  const params = new URLSearchParams({ lat: String(coordinates.lat), lng: String(coordinates.lng) });
  const response = await fetch(`/api/geocode?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status})`);
  return response.json();
}
