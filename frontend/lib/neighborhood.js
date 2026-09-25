export const typeNames = { city: "Город", microdistrict: "Микрорайон", complex: "Жилой комплекс", building: "Дом" };
export const categoryNames = { water: "Вода", electricity: "Электричество", heating: "Отопление", gas: "Газ", internet: "Интернет", elevator: "Лифт", road: "Дорога", cleaning: "Уборка", other: "Другое" };
export const statusNames = { planned: "Запланировано", ongoing: "Идёт", resolved: "Завершено", cancelled: "Отменено", reported: "Сообщение жителей · не подтверждено" };

export function locationListing(location, affected = false) {
  return { id: location.id, category: affected ? "neighborhood-alert" : "neighborhood", title: location.name, address: location.address, district: location.address, coordinates: location.coordinates, sourceLabel: location.sourceLabel, description: `${typeNames[location.type] || "Территория"}${affected ? " · затронута текущим сообщением" : " · сообщество жителей"}`, demo: Boolean(location.demo) };
}

export async function neighborhoodRequest(path, options) {
  const response = await fetch(`/api/neighborhood${path}`, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || (response.status === 401 ? "Войдите в аккаунт TezTap." : "Не удалось выполнить действие."));
  return data;
}

export function formatNeighborhoodDate(value) {
  if (!value) return "Не указано";
  return new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", dateStyle: "medium", timeStyle: "short" });
}
