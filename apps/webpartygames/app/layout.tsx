import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: {
    default: "WebPartyGames",
    template: "%s | WebPartyGames"
  },
  description: "Instant browser party games. No logins, just a link."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-950 text-slate-100 antialiased">
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">
              <div className="max-w-6xl mx-auto px-4 py-10">{children}</div>
            </main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}


