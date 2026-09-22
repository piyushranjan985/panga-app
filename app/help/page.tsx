'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { HELP_CATEGORIES, HELP_ENTRIES, entryById, searchHelp, type HelpEntry } from '@/lib/helpCenter';

// useSearchParams() (used below, for VybeHelp's /help?entry=<id> deep
// links) opts a page into client-side rendering unless it's wrapped in
// Suspense -- otherwise Next fails the build with a prerender error.
export default function HelpCenterPage() {
  return (
    <Suspense fallback={null}>
      <HelpCenterContent />
    </Suspense>
  );
}

function HelpCenterContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep link from VybeHelp's "sources" links (/help?entry=<id>) -- jump
  // straight to that category and open the matching accordion item.
  useEffect(() => {
    const wantedId = searchParams.get('entry');
    if (!wantedId) return;
    const entry = entryById(wantedId);
    if (!entry) return;
    setActiveCategory(entry.category);
    setOpenId(entry.id);
    const el = document.getElementById(`help-entry-${entry.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchParams]);

  // Search takes priority over the category filter -- typing a query and
  // then still having a category selected would otherwise silently hide
  // relevant results from other categories, which is the opposite of
  // what someone searching wants.
  const results: HelpEntry[] = useMemo(() => {
    if (query.trim().length > 0) {
      return searchHelp(query, 30).map((r) => r.entry);
    }
    if (activeCategory) {
      return HELP_ENTRIES.filter((e) => e.category === activeCategory);
    }
    return HELP_ENTRIES;
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, HelpEntry[]>();
    for (const entry of results) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [results]);

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="font-display text-2xl font-extrabold">Help Center</h1>
        <p className="mt-1 text-sm text-inkSoft">
          Search or browse below -- or tap the <span className="font-semibold">VybeHelp 💬</span> bubble anywhere in the
          app to ask a question directly.
        </p>

        <div className="mt-4">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenId(null);
            }}
            placeholder="Search the Help Center…"
            className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm outline-none focus:border-magenta"
            aria-label="Search the Help Center"
          />
        </div>

        {query.trim().length === 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                activeCategory === null ? 'border-magenta bg-magenta text-white' : 'border-line bg-white text-inkSoft'
              }`}
            >
              All topics
            </button>
            {HELP_CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setActiveCategory(c.slug)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  activeCategory === c.slug ? 'border-magenta bg-magenta text-white' : 'border-line bg-white text-inkSoft'
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        )}

        {results.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-line bg-white p-6 text-center">
            <p className="font-semibold">No results for &ldquo;{query}&rdquo;</p>
            <p className="mt-1 text-sm text-inkSoft">
              Try a different word, or ask VybeHelp directly -- open the 💬 bubble in the corner and just type your
              question naturally.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {(query.trim().length > 0
              ? [{ slug: '__search__', label: `${results.length} result${results.length === 1 ? '' : 's'}`, emoji: '🔎' }]
              : activeCategory
                ? HELP_CATEGORIES.filter((c) => c.slug === activeCategory)
                : HELP_CATEGORIES
            ).map((cat) => {
              const entries = query.trim().length > 0 ? results : (grouped.get(cat.slug) ?? []);
              if (entries.length === 0) return null;
              return (
                <section key={cat.slug}>
                  <h2 className="mb-2 flex items-center gap-1.5 font-display text-base font-bold">
                    <span aria-hidden>{cat.emoji}</span> {cat.label}
                  </h2>
                  <div className="space-y-2">
                    {entries.map((entry) => {
                      const isOpen = openId === entry.id;
                      return (
                        <div key={entry.id} id={`help-entry-${entry.id}`} className="overflow-hidden rounded-2xl border border-line bg-white scroll-mt-20">
                          <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? null : entry.id)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold"
                            aria-expanded={isOpen}
                          >
                            <span>{entry.question}</span>
                            <span className={`shrink-0 text-inkSoft transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden>
                              ⌄
                            </span>
                          </button>
                          {isOpen && (
                            <div className="border-t border-line px-4 py-3 text-sm leading-relaxed text-inkSoft">
                              {entry.answer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
