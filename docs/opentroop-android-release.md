# OpenTroop Android release

OpenTroop's first Android build is a self-contained, bot-only single-player
variant. It does not require an OpenFront server, account, login, payment
provider, ads, or network access to start a game.

## Local build

```bash
npm ci
npm run build-opentroop
npx cap sync android
```

The web output is written to `static/`. Capacitor copies it into the generated
Android project. The map allowlist is intentionally `world` for the first
release so the package stays small and the game has one well-tested path.

## Android artifacts

```bash
npm run android:debug
npm run android:release
```

The debug command produces an installable APK. The release command produces an
AAB when the Android project has a real release signing configuration. Do not
commit keystores or passwords. Configure Play App Signing / the upload key in
the local or CI environment before publishing.

The Gradle project reads the signing material only from these environment
variables, so no secret needs to be added to the repository:

```bash
export OPENTROOP_KEYSTORE_PATH=/absolute/path/to/opentroop-upload.jks
export OPENTROOP_KEYSTORE_PASSWORD='...'
export OPENTROOP_KEY_ALIAS='opentroop-upload'
export OPENTROOP_KEY_PASSWORD='...'
npm run android:release
```

Without all four values Gradle can still assemble an unsigned release for
technical verification, but it is not a Play Console upload artifact.

## Before Play Console upload

- Test the signed release build on a small and large Android phone, both
  portrait and landscape, with the device offline.
- Verify fresh install, first launch, start game, pause/resume, Android back,
  rotation, process restart, and an interrupted/continued local game.
- Fill the Play Console Data Safety form, content rating, app access, store
  listing, screenshots, privacy policy URL, and target API declaration.
- Use a closed test before production. The Play Console account owner must
  complete any account-specific testing requirement shown by Google.
