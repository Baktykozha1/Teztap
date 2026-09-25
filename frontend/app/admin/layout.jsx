import { authorizePage } from "../../lib/server-access";

export default async function ProtectedLayout({ children }) {
  await authorizePage("ADMIN_TOOLS");
  return children;
}
