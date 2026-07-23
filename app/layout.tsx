import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import GoogleTag from "@/components/GoogleTag";
import "./globals.css";

// Geist served from local woff2 — avoids the network fetch that next/font/google
// performs at build time (fails in offline CI and restricted environments).
// Source: node_modules/next/dist/esm/next-devtools/server/font/
const geist = localFont({
  src: [
    { path: "../public/fonts/geist-latin.woff2",     weight: "100 900", style: "normal" },
    { path: "../public/fonts/geist-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpaceNode · Visualização arquitetônica com IA que respeita seu projeto",
  description:
    "Renderize projetos reais preservando geometria, proporções e perspectiva. Visualização arquitetônica com IA para arquitetos e designers de interiores — do estudo ao material de apresentação.",
  keywords: [
    "render arquitetura",
    "IA para arquitetura",
    "visualização arquitetônica",
    "render para arquitetos",
    "renderização com IA",
    "arquitetura e interiores",
    "design de interiores",
    "SpaceNode",
  ],
  authors: [{ name: "SpaceNode" }],
  openGraph: {
    title: "SpaceNode · Visualização arquitetônica que respeita seu projeto",
    description:
      "Renderize projetos reais preservando geometria, proporções e perspectiva. Para arquitetos e designers de interiores.",
    url: "https://spacenode.app",
    siteName: "SpaceNode",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SpaceNode · Visualização arquitetônica que respeita seu projeto",
    description:
      "Renderize projetos reais preservando geometria, proporções e perspectiva. Para arquitetos e designers de interiores.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: `try{var t=localStorage.getItem('theme');var light=t==='light'||((t===null||t==='system')&&window.matchMedia('(prefers-color-scheme: light)').matches);if(location.pathname==='/')light=false;document.documentElement.classList.toggle('light',light)}catch(e){}`}} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <GoogleTag />
      </body>
    </html>
  );
}
