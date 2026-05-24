# @autotradeil/mobile

Production React Native (Expo) app for the AutoTradeIL B2B wholesale platform. Shares the FastAPI backend in `apps/api` and the Supabase project used by the web app.

## Stack

- Expo SDK 51 (New Architecture enabled), TypeScript strict
- React Navigation (native-stack + bottom-tabs)
- TanStack Query for server state, Zustand for ephemeral UI state
- Reanimated 3 + Gesture Handler for 60-FPS animations
- FlashList for virtualized lists, expo-image with blurhash transitions
- @gorhom/bottom-sheet for native bottom-sheet modals
- Zod for runtime API validation
- Sentry for crash + perf reporting
- expo-haptics (haptic on every interaction), expo-local-authentication (biometric unlock)
- i18n-js + expo-localization (Hebrew RTL default, English fallback)

## Getting started

```bash
pnpm install
pnpm --filter @autotradeil/mobile start
```

Set runtime values in `app.json` → `expo.extra`:

- `apiBaseUrl` — defaults to `https://autotradeil.onrender.com`
- `supabaseUrl` / `supabaseAnonKey`
- `sentryDsn`

## Architecture

```
src/
  components/   PressableScale, Button, Card, Skeleton, BottomSheetModal, ToastHost…
  navigation/   RootNavigator (auth gate) + TabNavigator (5 tabs) + deep-linking config
  screens/      Login, Splash, Dashboard, Inventory, Marketplace, Offers, Profile
  services/     api (axios + retry + token refresh), supabase, auth, queries (TQ),
                queryClient, haptics, sentry, i18n, config
  stores/       uiStore (Zustand toasts)
  theme/        Design tokens + light/dark ThemeProvider
  types/        Zod schemas as the source of truth for API shapes
  locales/      he.json (default), en.json
```

## Auth

- Supabase OAuth with Google + Apple providers (same project as the web app).
- Redirect URI: `autotradeil://auth/callback`.
- Optional biometric unlock gate after session restore (Face ID / Touch ID).
- Tokens persist via AsyncStorage; access token attached on every API call;
  401 triggers a one-shot refresh + retry.

## Quality gates

- `pnpm --filter @autotradeil/mobile typecheck`
- `pnpm --filter @autotradeil/mobile lint`
