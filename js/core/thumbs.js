// Thumbnail scheduler: renders thumbnails for (page, size) keys with bounded
// concurrency, an LRU bitmap cache and AbortController-based cancellation when
// a card leaves the viewport before its render finishes. Pure (no DOM, no
// window), so it can be unit-tested with fakes.
// renderThumbnail(key, signal) -> Promise<{ bitmap }>; bitmap must be closed
// by the caller when the result is stale or aborted.
// Returns { show, hide, pump, runningCount, queueSize, cacheSize }.
const THUMB_CACHE_LIMIT = 150;

export function createThumbnailScheduler({ renderThumbnail, onReady, concurrency = 3 }) {
  const cache = new Map(); // key -> { bitmap, width, height } (LRU by access)
  const tasks = new Map(); // page id -> { controller, key }
  let running = 0;
  const queue = [];

  function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    cache.delete(key);
    cache.set(key, entry);
    return entry;
  }

  function cacheSet(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    evict();
  }

  function evict() {
    while (cache.size > THUMB_CACHE_LIMIT) {
      const first = cache.entries().next();
      if (first.done) break;
      const [oldKey, oldEntry] = first.value;
      cache.delete(oldKey);
      oldEntry.bitmap.close();
    }
  }

  async function run(pageId, key, signal) {
    let bitmap;
    try {
      bitmap = (await renderThumbnail(key, signal)).bitmap;
      if (signal.aborted) {
        bitmap.close();
        return;
      }
      cacheSet(key, { bitmap, width: bitmap.width, height: bitmap.height });
      onReady(pageId, key, bitmap);
    } catch {
      // Aborted or failed to render: nothing to show for this card.
    } finally {
      running--;
      pump();
    }
  }

  function pump() {
    while (running < concurrency && queue.length) {
      const task = queue.shift();
      if (task.controller.signal.aborted) continue;
      running++;
      void run(task.pageId, task.key, task.controller.signal);
    }
  }

  function show(pageId, key) {
    const current = tasks.get(pageId);
    if (current && current.key === key) return;
    hide(pageId);
    const cached = cacheGet(key);
    if (cached) {
      onReady(pageId, key, cached.bitmap);
      return;
    }
    const controller = new AbortController();
    tasks.set(pageId, { controller, key });
    if (running < concurrency) {
      running++;
      void run(pageId, key, controller.signal);
    } else {
      queue.push({ pageId, key, controller });
    }
  }

  function hide(pageId) {
    const task = tasks.get(pageId);
    if (task) {
      tasks.delete(pageId);
      task.controller.abort();
    }
  }

  return {
    show,
    hide,
    pump,
    runningCount() {
      return running;
    },
    queueSize() {
      return queue.length;
    },
    cacheSize() {
      return cache.size;
    },
  };
}
