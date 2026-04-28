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
  title: "Spacenode · Renders arquitetônicos em segundos com IA",
  description:
    "A plataforma de visualização arquitetônica feita por arquiteto. Transforme sketches, plantas e modelos 3D em renders premium em segundos.",
  keywords: [
    "render arquitetônico",
    "visualização arquitetônica",
    "IA arquitetura",
    "archviz Brasil",
    "Spacenode",
  ],
  authors: [{ name: "Spacenode" }],
  openGraph: {
    title: "Spacenode · Renders arquitetônicos em segundos",
    description:
      "Transforme sketches, plantas e modelos 3D em renders premium em segundos. Feito por arquiteto, para arquitetos.",
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
    title: "Spacenode · Renders arquitetônicos em segundos",
    description:
      "Transforme sketches em renders premium em segundos. IA para arquitetos.",
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
        <script dangerouslySetInnerHTML={{__html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`}} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
