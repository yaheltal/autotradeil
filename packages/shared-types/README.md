# @autotradeil/shared-types

One TypeScript surface for every API + domain shape shared between `apps/web` and `apps/mobile`.

## What's inside

| Module         | Source             | Description                                                                                                                                                                      |
| -------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enums.ts`     | hand-written       | Stable domain enums (`UserType`, `DealerTier`, `InventoryStatus`, `OfferStatus`, `FuelType`, `Transmission`, etc.). Edit alongside the matching Pydantic literal in `apps/api/`. |
| `ids.ts`       | hand-written       | Branded ID types (`DealerId`, `InventoryId`, ...) — compile-time guard against passing the wrong id between calls.                                                               |
| `api.ts`       | re-exports         | Friendly aliases over `generated.ts` (e.g., `export type InventoryItem = components["schemas"]["InventoryItemResponse"]`).                                                       |
| `generated.ts` | **auto-generated** | TS types extracted from the backend's `/openapi.json` via `openapi-typescript`. Never hand-edit.                                                                                 |
| `zod/*.ts`     | optional           | Narrow runtime validation schemas for the network boundary (mobile uses these in its axios layer).                                                                               |

## Consumption

Both apps depend on this package as a workspace symlink:

```jsonc
// apps/web/package.json, apps/mobile/package.json
"dependencies": {
  "@autotradeil/shared-types": "workspace:*"
}
```

Import either the barrel:

```ts
import { DealerId, InventoryStatus } from "@autotradeil/shared-types";
```

…or a specific subpath when bundle-size matters:

```ts
import type { InventoryItem } from "@autotradeil/shared-types/api";
```

### Mobile / Metro

Metro doesn't read `tsconfig.paths`, so `apps/mobile/babel.config.js` declares an explicit `module-resolver` alias pointing at this package's `dist/`. The package MUST be built (`pnpm --filter @autotradeil/shared-types build`) before `expo start --clear` will find it. Once `dist/` exists, normal incremental builds keep it in sync.

## Scripts

```powershell
pnpm --filter @autotradeil/shared-types build          # compile to dist/
pnpm --filter @autotradeil/shared-types typecheck      # tsc --noEmit
pnpm --filter @autotradeil/shared-types generate       # refresh generated.ts from a live API on :8000
pnpm --filter @autotradeil/shared-types generate:check # CI gate — fail if generated.ts drifts from snapshot
```

## CI drift gate

`scripts/generate.ts --check` regenerates `generated.ts` against a live API and exits non-zero if the new output differs from the committed snapshot. Run as a CI step to catch silent schema drift between the backend and frontend types.
