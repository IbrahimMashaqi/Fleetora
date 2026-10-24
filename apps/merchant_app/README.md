# Fleetora merchant — Flutter

This is Fleetora's official merchant mobile application, implemented in Flutter and Dart.

Requires Flutter stable 3.47.7 / Dart 3.13.5 or a compatible stable SDK. Dependencies are locked in `pubspec.lock`.

```powershell
Set-Location C:\Projects\Fleetora\apps\merchant_app
$flutter = Join-Path $env:LOCALAPPDATA 'Fleetora\toolchains\flutter-sdk\bin\flutter.bat'
& $flutter pub get
& $flutter gen-l10n
& $flutter test --no-pub
& $flutter analyze --no-pub
& $flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:3001
```

The backend must use the approved Phase 1 contract `9f414f76d4fb32c1e38dc21b1246d1b70af9d69df308c3264ebc0e38b7162d11`. This task does not deploy that migration to Neon. Use the isolated PostgreSQL test runner for integration verification; do not point destructive tests at Neon.

For Android emulator debug builds use `--dart-define=API_BASE_URL=http://10.0.2.2:3001`. For a phone, configure a reachable trusted development backend; do not assume localhost addresses the computer. iOS local HTTP remains subject to ATS: prefer trusted HTTPS. Release builds require an HTTPS API origin. Never put database credentials, tokens or passwords in dart-defines.

`MAP_STYLE_URL` optionally selects a licensed MapLibre style. The default is OpenFreeMap Liberty, with attribution. No private provider key is required. Pins require explicit confirmation; no device GPS is assumed to be a recipient location.

Web preview loads the licensed MapLibre GL JS 6.14.0 engine and CSS locally before Flutter bootstrap. `web/vendor/maplibre-gl/manifest.json` records the upstream package, license and asset SHA-256 hashes. Native rendering uses the Flutter MapLibre plugin.

Android SDK/device tools are a separate prerequisite. Windows cannot build an iOS archive. Native map, file dialog, secure storage, PDF print/share, signing and device installation need device QA before distribution. Android release tasks fail closed unless `FLEETORA_ANDROID_KEY_PROPERTIES` names a private properties file containing `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`; keep that file and the keystore outside Git. Release never falls back to a debug signing key. iOS signing must be configured on macOS.

Activation can be entered manually or handed off through `fleetora-merchant://app/activate?token=…`. The app accepts only a bounded single invitation token; company and merchant membership are resolved by NestJS. Device-level deep-link handling remains part of native QA.

Money is rendered from server decimal strings. NestJS owns pricing and permissions. Web preview stores session tokens in memory; installed mobile uses platform secure storage. Uncertain writes require explicit same-identity retry; the app never automatically replays a POST.

Do not commit local SDKs, `.dart_tool`, build output, local.properties, signing files or private environment configuration.

To regenerate localized copy after editing feature `lib/features/**/translations.json` files or the shared copy in the tool, run `node tool/generate-localizations.cjs`, then `flutter gen-l10n` from this app. Typed wire models live in `lib/core/networking/models.dart`; regenerate their serializers with `dart run build_runner build --delete-conflicting-outputs` after model changes. Keep generated Dart, ARB and JSON sources under version control.

Features own their repositories and presentation. Shared infrastructure owns HTTP, session lifecycle, token storage and UI primitives. Session changes dispose the authenticated provider scope; stale responses are rejected. Refresh is single-flight; only safe reads may replay automatically. Preserve these boundaries when extending the app.

On this Windows host the Android SDK is at `%LOCALAPPDATA%\Fleetora\toolchains\android-sdk`. Set `ANDROID_HOME` and `ANDROID_SDK_ROOT` to that directory. The existing QA device also needs `ANDROID_USER_HOME=$env:ANDROID_HOME + '\android-user'` and `ANDROID_AVD_HOME=$env:ANDROID_HOME + '\avd'`. These are host paths, not repository dependencies. Other developers may use their own supported SDK installation and `flutter config --android-sdk <path>`.

Backend end-to-end tests resolve Flutter from PATH or the absolute `FLEETORA_FLUTTER_BIN` override. They provision their own loopback database, test identities and temporary web exports; do not substitute a live Neon URL. Run `node test/run-parcel-integration.cjs test/merchant-portal.auth-integration.spec.ts --maxWorkers=1` from `backend` with a complete local PostgreSQL 18 server toolchain selected through `FLEETORA_PG_BIN` where necessary. `FLEETORA_ANDROID_DEVICE=emulator-5554` additionally opts into the owned Android QA device.

The canonical browser integration runs the real Flutter web build through NestJS, an isolated PostgreSQL database and the existing company dashboard. It verifies that web preview tokens stay in memory: navigation preserves the session, while a fresh document requires login again. Device token-store unit tests use the storage plugin's test fixture and do not replace device QA.

Native Android validation remains incomplete. After the SDK relocation, the Android debug build, installation, Arabic/English layout, login, secure storage, session restoration and access-token refresh were verified on the API-35 emulator. The latest full native scenario failed at map selection: coordinates stayed empty and the captured emulator screen showed "System UI isn't responding". Subsequent workflow checks were not reached; this run cannot establish native map correctness. Full employee/finance/company-pickup parity, process-death restoration, activation deep links, physical printing/share delivery and iOS validation also remain distribution gates. A chooser opening does not prove printing or sharing completed. The authoritative business rules are in `docs/merchant-business-model.txt` at the repository root.
