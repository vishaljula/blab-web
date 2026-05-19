import type { Metadata, Viewport } from "next";
import { Inter, DM_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Blab — Find Real Properties in India",
  description:
    "India's premium real estate marketplace. Explore verified properties on an interactive map. Real photos, real prices, real locations. No fake listings.",
  keywords: [
    "real estate India",
    "property search",
    "buy property Hyderabad",
    "rent apartment India",
    "verified listings",
    "map search property",
  ],
  openGraph: {
    title: "Blab — Find Real Properties in India",
    description:
      "Explore verified properties on an interactive map. Real photos, real prices, real locations.",
    type: "website",
    locale: "en_IN",
    siteName: "Blab",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FAFAF8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
      <body>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              borderRadius: "var(--radius-md)",
            },
          }}
        />
      </body>
    </html>
  );
}
