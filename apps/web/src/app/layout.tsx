import type { Metadata } from "next";

import { WebVitals } from "../components/web-vitals";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trefle",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
