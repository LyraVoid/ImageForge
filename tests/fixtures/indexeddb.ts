/**
 * Just enough of IndexedDB for the persistence layer, with no dependency added: the tests are about
 * what this project stores and reads back, not about a database implementation.
 */
type Row = Record<string, unknown>;

class FakeRequest<T> {
  result: T | null = null;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeStore {
  private readonly rows: Map<string, Row>;

  constructor(rows: Map<string, Row>) {
    this.rows = rows;
  }

  put(value: Row): void {
    this.rows.set(value.id as string, value);
  }

  delete(id: string): void {
    this.rows.delete(id);
  }

  getAll(): FakeRequest<Row[]> {
    const request = new FakeRequest<Row[]>();
    queueMicrotask(() => {
      request.result = [...this.rows.values()];
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private readonly stores: Map<string, FakeStore>;

  constructor(stores: Map<string, FakeStore>) {
    this.stores = stores;
    queueMicrotask(() => this.oncomplete?.());
  }

  objectStore(name: string): FakeStore {
    const store = this.stores.get(name);
    if (!store) throw new Error("no such object store: " + name);
    return store;
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  readonly stores: Map<string, FakeStore>;

  constructor(stores: Map<string, FakeStore>) {
    this.stores = stores;
  }

  createObjectStore(name: string): void {
    this.stores.set(name, new FakeStore(new Map()));
  }

  transaction(_name: string): FakeTransaction {
    return new FakeTransaction(this.stores);
  }

  close(): void {}
}

export function installFakeIndexedDb(): { clear: () => void } {
  const stores = new Map<string, FakeStore>();
  const factory = {
    open: (_name?: string, _version?: number) => {
      const request = new FakeRequest<FakeDatabase>();
      const database = new FakeDatabase(stores);
      if (stores.size === 0) {
        // the first open runs the upgrade, which is where the stores are made
        queueMicrotask(() => {
          request.result = database;
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
      } else {
        queueMicrotask(() => {
          request.result = database;
          request.onsuccess?.();
        });
      }
      return request;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = factory;
  return {
    clear: () => {
      stores.clear();
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    },
  };
}
