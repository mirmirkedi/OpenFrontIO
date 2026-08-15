#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
KEYSTORE_PATH="$ANDROID_DIR/worldfront-release.keystore"
ENV_PATH="$ANDROID_DIR/worldfront.release-signing.env"

if [[ -e "$KEYSTORE_PATH" || -e "$ENV_PATH" ]]; then
  echo "Release signing files already exist. Refusing to overwrite them."
  exit 1
fi

read -r -p "Key alias [worldfront-release]: " KEY_ALIAS
KEY_ALIAS="${KEY_ALIAS:-worldfront-release}"
read -r -s -p "Keystore password: " STORE_PASSWORD
echo
read -r -s -p "Confirm keystore password: " STORE_PASSWORD_CONFIRM
echo
if [[ "$STORE_PASSWORD" != "$STORE_PASSWORD_CONFIRM" || -z "$STORE_PASSWORD" ]]; then
  echo "Passwords do not match or are empty." >&2
  exit 1
fi

read -r -s -p "Key password (press Enter to reuse keystore password): " KEY_PASSWORD
echo
KEY_PASSWORD="${KEY_PASSWORD:-$STORE_PASSWORD}"

keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE_PATH" \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=WorldFront, OU=Keddy Studio, O=Keddy Studio, L=, ST=, C=TR"

umask 077
cat > "$ENV_PATH" <<EOF
export OPENTROOP_KEYSTORE_PATH="$KEYSTORE_PATH"
export OPENTROOP_KEYSTORE_PASSWORD="$STORE_PASSWORD"
export OPENTROOP_KEY_ALIAS="$KEY_ALIAS"
export OPENTROOP_KEY_PASSWORD="$KEY_PASSWORD"
EOF

chmod 600 "$KEYSTORE_PATH" "$ENV_PATH"
echo
echo "Created: $KEYSTORE_PATH"
echo "Created: $ENV_PATH"
echo "Back up both files securely. Do not commit or upload them."
echo "Load signing variables with: source \"$ENV_PATH\""
