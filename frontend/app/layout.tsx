import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Noto_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-sans-arabic",
  subsets: ["arabic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fleetora",
    template: "%s | Fleetora",
  },
  description: "Fleetora logistics operations.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get("fleetora_locale")?.value;
  const locale = savedLocale === "ar" ? "ar" : "en";

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${inter.variable} ${notoSansArabic.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
