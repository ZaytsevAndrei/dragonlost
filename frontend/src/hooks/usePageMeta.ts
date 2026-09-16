import { useEffect } from 'react';

interface PageMetaInput {
  title: string;
  description?: string;
  /** Канонический относительный путь, например '/leaders' */
  path?: string;
}

function setMetaAttribute(selector: string, attr: string, value: string): void {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Обновляет title/description/OG при клиентской навигации SPA.
 * Для превью ссылок у краулеров без JS мета подставляет backend (routes/meta.ts).
 */
export function usePageMeta({ title, description, path }: PageMetaInput): void {
  useEffect(() => {
    document.title = title;

    if (description) {
      setMetaAttribute('meta[name="description"]', 'content', description);
      setMetaAttribute('meta[property="og:description"]', 'content', description);
      setMetaAttribute('meta[name="twitter:description"]', 'content', description);
    }

    setMetaAttribute('meta[property="og:title"]', 'content', title);
    setMetaAttribute('meta[name="twitter:title"]', 'content', title);

    const canonicalPath = path || window.location.pathname;
    const url = `https://dragonlost.ru${canonicalPath === '/' ? '/' : canonicalPath}`;
    setMetaAttribute('meta[property="og:url"]', 'content', url);
    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);
  }, [title, description, path]);
}
