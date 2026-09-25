import { authorizePage } from "../../lib/server-access";

export default async function ProtectedLayout({ children }) {
  await authorizePage("ENTERPRISE_TOOLS");
  return children;
}
