#!/usr/bin/env bash
# Certificado autofirmado SOLO para desarrollo local.
set -euo pipefail

CERTS="$(dirname "$0")/../nginx/certs"
mkdir -p "$CERTS"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$CERTS/privkey.pem" -out "$CERTS/fullchain.pem" \
  -subj "/CN=localhost"
echo "Certificado generado en $CERTS"
