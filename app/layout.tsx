import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
  title: "SpaceNode · Plataforma visual para arquitetura e interiores",
  description:
    "A plataforma criativa para arquitetos e designers de interiores. Crie renders, refine imagens e impressione clientes em minutos.",
  keywords: [
    "render arquitetônico",
    "visualização arquitetônica",
    "IA arquitetura",
    "design de interiores",
    "apresentação visual",
    "archviz Brasil",
    "SpaceNode",
  ],
  authors: [{ name: "SpaceNode" }],
  openGraph: {
    title: "SpaceNode · Plataforma visual para arquitetura e interiores",
    description:
      "Crie renders, refine imagens e impressione clientes em minutos. Para arquitetos e designers de interiores.",
    url: "https://spacenode.app",
    siteName: "SpaceNode",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpaceNode",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SpaceNode · Plataforma visual para arquitetura e interiores",
    description:
      "Crie renders e assets visuais premium em minutos. Para arquitetos e designers de interiores.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
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
        <script dangerouslySetInnerHTML={{__html: `try{if(localStorage.getItem('theme')==='light'){document.documentElement.classList.add('light')}}catch(e){}`}} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
