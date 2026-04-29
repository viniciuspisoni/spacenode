import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spacenode · Plataforma visual para arquitetura e interiores",
  description:
    "A plataforma criativa para arquitetos e designers de interiores. Crie renders, refine imagens e impressione clientes em minutos.",
  keywords: [
    "render arquitetônico",
    "visualização arquitetônica",
    "IA arquitetura",
    "design de interiores",
    "apresentação visual",
    "archviz Brasil",
    "Spacenode",
  ],
  authors: [{ name: "Spacenode" }],
  openGraph: {
    title: "Spacenode · Plataforma visual para arquitetura e interiores",
    description:
      "Crie renders, refine imagens e impressione clientes em minutos. Para arquitetos e designers de interiores.",
    url: "https://spacenode.app",
    siteName: "Spacenode",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Spacenode",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spacenode · Plataforma visual para arquitetura e interiores",
    description:
      "Crie renders e assets visuais premium em minutos. Para arquitetos e designers de interiores.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
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
