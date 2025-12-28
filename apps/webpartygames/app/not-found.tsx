import Link from "next/link";

export default function NotFound() {
  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Not found
        </h1>
        <p className="text-slate-300">
          This page doesn’t exist. Head back to the game hub.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold hover:border-emerald-400 hover:bg-slate-900 transition"
      >
        Back to home
      </Link>
    </main>
  );
}


