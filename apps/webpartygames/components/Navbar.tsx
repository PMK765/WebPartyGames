import Link from "next/link";

export function Navbar() {
  return (
    <header className="border-b border-slate-900/80 bg-slate-950/60 backdrop-blur">
      <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 text-sm font-semibold">
            WP
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              WebPartyGames
            </div>
            <div className="text-xs text-slate-400">
              No logins, just a link
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400 hover:bg-slate-900 transition"
          >
            Games
          </Link>
        </div>
      </nav>
    </header>
  );
}


