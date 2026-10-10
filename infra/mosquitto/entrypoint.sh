#!/bin/sh
# Builds the Mosquitto password file from env vars at container start, then starts the broker.
#   MQTT_BACKEND_USERNAME / MQTT_BACKEND_PASSWORD  the backend account (must match acl: ward-backend)
#   MQTT_DEVICE_CREDENTIALS                         comma-separated device_id:password pairs
# The password may contain ':' but not ','. Only hashes are written to disk.
set -eu

CONF=/mosquitto/config
SRC=/ward-mosquitto
backend_user="${MQTT_BACKEND_USERNAME:-ward-backend}"
backend_pass="${MQTT_BACKEND_PASSWORD:-}"
devices="${MQTT_DEVICE_CREDENTIALS:-}"

[ "$backend_user" = "ward-backend" ] || { echo "MQTT_BACKEND_USERNAME must be ward-backend (the name used in infra/mosquitto/acl)" >&2; exit 1; }
[ -n "$backend_pass" ] || { echo "MQTT_BACKEND_PASSWORD is empty" >&2; exit 1; }

# WARD_ENV=prod refuses the public demo passwords, like the backend does for its own secrets.
check_not_demo() {
  if [ "${WARD_ENV:-demo}" = "prod" ]; then
    case "$2" in change-me*) echo "WARD_ENV=prod but the MQTT password of '$1' is still a demo default" >&2; exit 1 ;; esac
  fi
}

rm -f "$CONF/passwd"
check_not_demo "$backend_user" "$backend_pass"
mosquitto_passwd -b -c "$CONF/passwd" "$backend_user" "$backend_pass" >/dev/null

count=0
old_ifs="$IFS"; IFS=','
set -- $devices
IFS="$old_ifs"
for pair in "$@"; do
  [ -n "$pair" ] || continue
  case "$pair" in *:*) ;; *) echo "MQTT_DEVICE_CREDENTIALS entry '$pair' is not device_id:password" >&2; exit 1 ;; esac
  dev="${pair%%:*}"; pw="${pair#*:}"
  [ -n "$dev" ] && [ -n "$pw" ] || { echo "MQTT_DEVICE_CREDENTIALS has an empty device id or password" >&2; exit 1; }
  [ "$dev" != "$backend_user" ] || { echo "a device may not be called $backend_user" >&2; exit 1; }
  check_not_demo "$dev" "$pw"
  mosquitto_passwd -b "$CONF/passwd" "$dev" "$pw" >/dev/null
  count=$((count + 1))
done

cp "$SRC/acl" "$CONF/acl"
# Mosquitto drops to the 'mosquitto' user and wants these files owned by it and not world-readable.
chown mosquitto:mosquitto "$CONF/passwd" "$CONF/acl" 2>/dev/null || true
chmod 0600 "$CONF/passwd" "$CONF/acl"
echo "ward-mqtt: password file ready (backend + $count device account(s))"

exec /docker-entrypoint.sh /usr/sbin/mosquitto -c "$SRC/mosquitto.conf"
