const STORAGE_PREFIX = 'dragonlost_';

const ALLOWED_PAGES = new Set(['/inventory', '/rewards']);

function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function safeGetItem(key: string): string | null {
  try {
    if (!isStorageAvailable()) return null;
    return localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (!isStorageAvailable()) return;
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    // Private browsing or quota exceeded — silently ignore
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (!isStorageAvailable()) return;
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Silently ignore
  }
}

function saveLastPage(page: string): void {
  if (ALLOWED_PAGES.has(page)) {
    safeSetItem('lastPage', page);
  }
}

function getLastPage(): string | null {
  const page = safeGetItem('lastPage');
  if (page && ALLOWED_PAGES.has(page)) {
    return page;
  }
  return null;
}

function clearLastPage(): void {
  safeRemoveItem('lastPage');
}

export { safeGetItem, safeSetItem, safeRemoveItem, saveLastPage, getLastPage, clearLastPage };
