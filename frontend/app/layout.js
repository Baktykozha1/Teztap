import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import "./neighborhood.css";
import "./access.css";
import Link from "next/link";
import { AccessProvider } from "../components/access-provider";
import { WorkspaceProvider } from "../components/workspace-provider";

export const metadata = {
  title: "TezTap — всё нужное в Актау",
  description: "TezTap объединяет места, образование, работу, услуги и объявления Актау на общей карте. TezTap AI помогает находить и сравнивать подходящие варианты."
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <AccessProvider>
          <WorkspaceProvider>
            {children}
            <Link className="globalTezTapAiButton" href="/analyze#mercora-ai" aria-label="Открыть TezTap AI">
              <span aria-hidden="true">✦</span><strong>TezTap AI</strong>
            </Link>
          </WorkspaceProvider>
        </AccessProvider>
      </body>
    </html>
  );
}
