# WebPartyGames – Cursor Project README

This README defines the global rules and conventions for the WebPartyGames project inside Cursor.

Treat this document as the source of truth whenever creating, editing, or refactoring code.

## Tech Stack & Architecture

- Framework: Next.js 14+ with App Router (`app/` directory)
- Language: TypeScript everywhere
- Styling: Tailwind CSS
- Components:
  - Prefer server components by default
  - Use client components only for interactive / browser-only features

## Global Rules (IMPORTANT)

1. TypeScript everywhere.
   - No `.js` files; use `.ts` and `.tsx`.

2. App Router only.
   - Use `app/` directory for routing.
   - No legacy `pages/` routing.

3. No `try/catch` blocks.
   - Use conditional checks and defensive coding instead.
   - If something might fail (e.g., `localStorage`, `navigator.clipboard`, `window`), guard with presence checks.

4. No placeholder comments.
   - Do not add comments like `// TODO`, `// existing code`, `// rest of code`.
   - When editing a file, produce full, real code.

5. Tailwind for styling.
   - Use Tailwind classes for layout and design.
   - Favor a clean, modern, minimalist UI with consistent spacing and hover states.

6. Accessibility & responsiveness.
   - Mobile-first layouts.
   - Semantic HTML (`<main>`, `<section>`, `<nav>`, headings in order).


