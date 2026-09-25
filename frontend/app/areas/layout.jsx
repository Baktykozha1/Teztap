import { authorizePage } from "../../lib/server-access";

export default async function ProtectedLayout({ children }) {
  await authorizePage("BEST_DISTRICT_FINDER");
  return children;
}
