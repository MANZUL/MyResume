import type { StoreProvider } from './store-provider';
import { UnavailableStoreProvider } from './store-provider';

// Chooses the store provider for this build.
//   Development builds: the fake store, so premium flows can be exercised.
//   Release builds: no store yet (real Apple/Google billing is a later,
//   separately approved step), so every user stays FREE.
// The fake store is required only inside the __DEV__ branch; production
// bundling removes that branch, so release bundles do not contain it.

export function createStoreProvider(): StoreProvider {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FakeStoreProvider } = require('./fake-store') as typeof import('./fake-store');
    return new FakeStoreProvider();
  }
  return new UnavailableStoreProvider();
}
