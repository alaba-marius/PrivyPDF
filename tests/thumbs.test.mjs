import { test } from "node:test";
import assert from "node:assert/strict";
import { createThumbnailScheduler } from "../js/core/thumbs.js";

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function bitmap(w, h) {
  return { width: w, height: h, closed: false, close() { this.closed = true; } };
}

test("scheduler renders a thumbnail and notifies onReady", async (t) => {
  const rendered = [];
  const ready = [];
  const sched = createThumbnailScheduler({
    renderThumbnail: async (key) => {
      rendered.push(key);
      return { bitmap: bitmap(10, 10) };
    },
    onReady: (pageId, key, bm) => ready.push([pageId, key, bm]),
  });
  sched.show("p1", "s1:0:100x100");
  await flush();
  assert.deepStrictEqual(rendered, ["s1:0:100x100"]);
  assert.equal(ready.length, 1);
  assert.equal(ready[0][0], "p1");
  assert.equal(ready[0][1], "s1:0:100x100");
  assert.equal(ready[0][2].width, 10);
});

test("scheduler does not re-render the same page and key", async (t) => {
  const rendered = [];
  const sched = createThumbnailScheduler({
    renderThumbnail: async (key) => {
      rendered.push(key);
      return { bitmap: bitmap(1, 1) };
    },
    onReady: () => {},
  });
  sched.show("p1", "k1");
  sched.show("p1", "k1");
  await flush();
  assert.deepStrictEqual(rendered, ["k1"]);
});

test("scheduler re-renders when the same page gets a different key", async (t) => {
  const rendered = [];
  const sched = createThumbnailScheduler({
    renderThumbnail: async (key) => {
      rendered.push(key);
      return { bitmap: bitmap(1, 1) };
    },
    onReady: () => {},
  });
  sched.show("p1", "k1");
  sched.show("p1", "k2");
  await flush();
  assert.deepStrictEqual(rendered, ["k1", "k2"]);
});

test("scheduler cancels a render when the card hides", async (t) => {
  let resolveRender;
  const render = () => new Promise((resolve) => { resolveRender = resolve; });
  const ready = [];
  const sched = createThumbnailScheduler({ renderThumbnail: render, onReady: (p, k, b) => ready.push([p, k]) });
  sched.show("p1", "k1");
  sched.hide("p1");
  resolveRender({ bitmap: bitmap(1, 1) });
  await flush();
  assert.deepStrictEqual(ready, []);
  assert.equal(sched.runningCount(), 0);
});

test("scheduler caps concurrency and queues the rest", async (t) => {
  const releases = [];
  const render = async () => {
    await new Promise((resolve) => releases.push(resolve));
    return { bitmap: bitmap(1, 1) };
  };
  const sched = createThumbnailScheduler({ renderThumbnail: render, onReady: () => {}, concurrency: 2 });
  sched.show("p1", "k1");
  sched.show("p2", "k2");
  sched.show("p3", "k3");
  assert.equal(sched.runningCount(), 2);
  assert.equal(sched.queueSize(), 1);
  releases[0]();
  await flush();
  assert.equal(sched.runningCount(), 2);
  assert.equal(sched.queueSize(), 0);
  releases[1]();
  releases[2]();
  await flush();
  assert.equal(sched.runningCount(), 0);
});

test("scheduler reuses cached bitmaps without re-rendering", async (t) => {
  const rendered = [];
  const ready = [];
  const sched = createThumbnailScheduler({
    renderThumbnail: async (key) => {
      rendered.push(key);
      return { bitmap: bitmap(5, 5) };
    },
    onReady: (p, k, b) => ready.push([p, k]),
  });
  sched.show("p1", "k1");
  await flush(); // render completes and the bitmap is cached
  sched.hide("p1"); // task already done; cache keeps "k1"
  await flush();
  sched.show("p1", "k1"); // cache hit: onReady again, no re-render
  await flush();
  assert.deepStrictEqual(rendered, ["k1"]);
  assert.equal(ready.length, 2);
});

test("scheduler evicts the oldest cached bitmap over the limit", async (t) => {
  const closed = [];
  const sched = createThumbnailScheduler({
    renderThumbnail: async () => ({ bitmap: { width: 1, height: 1, close() { closed.push("bm"); } } }),
    onReady: () => {},
    concurrency: 5,
  });
  for (let i = 0; i < 151; i++) sched.show(`p${i}`, `s:0:${i}x10`);
  await flush();
  assert.equal(sched.cacheSize(), 150);
  assert.equal(closed.length, 1);
});

test("scheduler does not notify for a queued task that was hidden", async (t) => {
  const releases = [];
  const render = async () => {
    await new Promise((resolve) => releases.push(resolve));
    return { bitmap: bitmap(1, 1) };
  };
  const ready = [];
  const sched = createThumbnailScheduler({ renderThumbnail: render, onReady: (p, k, b) => ready.push([p, k]), concurrency: 1 });
  sched.show("p1", "k1");
  sched.show("p2", "k2");
  sched.hide("p2"); // aborts the queued task
  assert.equal(sched.queueSize(), 1); // aborted entry still occupies a queue slot
  releases[0]();
  await flush(); // pump skips the aborted entry
  assert.equal(sched.runningCount(), 0);
  assert.equal(sched.queueSize(), 0);
  assert.equal(ready.length, 1);
  assert.equal(ready[0][0], "p1");
  assert.equal(ready[0][1], "k1");
});
