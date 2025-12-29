import "./globals.css";
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import AppShell from '@/components/AppShell';
import Providers from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <AppShell> {children} </AppShell> 
        </Providers>
      </body>
    </html>
  );
}
