import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Winding Thread | Interactive 3D Word-Association Chain Game",
  description: "A real-time, collaborative 3D kinetic typography word-association chain. Submit words, build paths, and compete globally on the leaderboard.",
  keywords: [
    "word association game",
    "winding thread",
    "collaborative word chain",
    "kinetic typography 3D",
    "semantic mapping",
    "online word chain",
    "global leaderboard word game",
    "creative word chain"
  ],
  alternates: {
    canonical: "https://windingthread.vercel.app",
  },
  openGraph: {
    title: "The Winding Thread | Interactive 3D Word-Association Chain",
    description: "Submit connected words to a collective, real-time kinetic typography map. Check the leaderboard to see your country's standing.",
    url: "https://windingthread.vercel.app",
    siteName: "The Winding Thread",
    images: [
      {
        url: "https://windingthread.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "The Winding Thread - 3D Kinetic Word Chain Map Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Winding Thread | Interactive 3D Word-Association Chain",
    description: "Submit connected words to a collective, real-time kinetic typography map. Check the leaderboard to see your country's standing.",
    images: ["https://windingthread.vercel.app/og-image.png"],
    creator: "@windingthread0",
  },
  other: {
    "geo.region": "IN-MH",
    "geo.placename": "Mumbai",
    "geo.position": "19.0760;72.8777",
    "ICBM": "19.0760, 72.8777",
  },
  verification: {
    google: "ml5wzaig-ycsg1rhdc9FG9Az-OnlsNxHPgklNCYdQgA",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "The Winding Thread",
              "applicationCategory": "GameApplication",
              "operatingSystem": "All",
              "genre": "Word Association Game",
              "browserRequirements": "Requires JavaScript. Requires HTML5 Canvas.",
              "softwareVersion": "1.1",
              "description": "A collaborative, real-time 3D kinetic typography word-association chain game. Connect words semantically, explore global contributions, and trace the thread.",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Person",
                "name": "Yashvardhan",
                "url": "https://github.com/Yashvardhan4646"
              },
              "publisher": {
                "@type": "Person",
                "name": "Yashvardhan",
                "url": "https://github.com/Yashvardhan4646"
              },
              "codeRepository": "https://github.com/Yashvardhan4646/Winding-Thread"
            })
          }}
        />
      </head>
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
