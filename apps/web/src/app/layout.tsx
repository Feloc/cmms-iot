import "./globals.css";
import type { ReactNode } from "react";
import Providers from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

