import { authorizePage } from "../../lib/server-access";

export default async function ProtectedLayout({ children }) {
  await authorizePage("OPPORTUNITY_SCANNER");
  return children;
}
