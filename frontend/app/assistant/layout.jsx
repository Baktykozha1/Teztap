import { authorizePage } from "../../lib/server-access";

export default async function ProtectedLayout({ children }) {
  await authorizePage("AI_ADVISOR");
  return children;
}
