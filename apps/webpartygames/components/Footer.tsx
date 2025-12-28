export function Footer() {
  return (
    <footer className="border-t border-slate-900/80">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-300">
            WebPartyGames — instant browser party games.
          </div>
          <div className="text-xs text-slate-500">
            No accounts. No server-stored user data. Same-device MVP.
          </div>
        </div>
      </div>
    </footer>
  );
}


