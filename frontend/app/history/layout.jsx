import { authorizePage } from "../../lib/server-access";

export default async function ProtectedLayout({ children }) {
  await authorizePage("MULTIPLE_PROJECTS");
  return children;
}
