#!/usr/bin/env bash
# Brings up the Phase 1 hardware-trial camera segment: fog as DHCP + DNS (spec §3.1).
#
#   sudo scripts/discoveryTrialSegment.sh
#   sudo NIC=eth0 scripts/discoveryTrialSegment.sh    # override the NIC
#
# Run as root in a real terminal (sudo needs a TTY for its password prompt).
# Ctrl-C stops dnsmasq; the address is left in place, remove it with:
#   ip addr del 192.168.50.1/24 dev "$NIC"
set -euo pipefail

NIC="${NIC:-enx207bd52a0f29}"
CONF="$(dirname "$(readlink -f "$0")")/dnsmasq-trial.conf"

if [[ ! -e "/sys/class/net/$NIC" ]]; then
  echo "error: $NIC is not present — plug the Ethernet adapter in." >&2
  echo "present non-virtual NICs:" >&2
  for f in /sys/class/net/*; do
    [[ "$(readlink -f "$f")" == */virtual/* ]] || echo "  $(basename "$f")" >&2
  done
  exit 1
fi

# The same three checks PhysicalEthernetProvider.isEligible() applies, so a NIC
# the scanner would silently skip is caught here instead of mid-trial.
[[ "$(cat "/sys/class/net/$NIC/type")" == "1" ]] || {
  echo "error: $NIC is not an Ethernet device (type != 1)" >&2; exit 1; }
[[ "$(readlink -f "/sys/class/net/$NIC")" != */virtual/* ]] || {
  echo "error: $NIC is virtual — the scanner would skip it" >&2; exit 1; }
[[ "$(cat "/sys/class/net/$NIC/carrier" 2>/dev/null || echo 0)" == "1" ]] || {
  echo "warning: $NIC has no carrier — is the switch cable in?" >&2; }

# NetworkManager runs its own DHCP *client* on this NIC. Fog is the DHCP server
# here, so nothing ever answers it; NM times out after 45s, reports
# 'ip-config-unavailable', FLUSHES the interface and retries forever — wiping
# the address out from under dnsmasq. Hand the NIC to us for the duration.
# Runtime-only: NM takes it back on restart, or run
#   nmcli device set "$NIC" managed yes
if command -v nmcli >/dev/null 2>&1; then
  if [[ "$(nmcli -t -f GENERAL.STATE device show "$NIC" 2>/dev/null)" != *unmanaged* ]]; then
    nmcli device set "$NIC" managed no
    echo "told NetworkManager to stop managing $NIC"
    sleep 1
  fi
fi

ip link set "$NIC" up
if ip -4 addr show dev "$NIC" | grep -q '192\.168\.50\.1/24'; then
  echo "192.168.50.1/24 already on $NIC"
else
  ip addr add 192.168.50.1/24 dev "$NIC"
  echo "added 192.168.50.1/24 to $NIC"
fi

# The address must still be there a moment later; if NM (or anything else) is
# still flushing, dnsmasq would bind a socket that dies silently.
sleep 2
ip -4 addr show dev "$NIC" | grep -q '192\.168\.50\.1/24' || {
  echo "error: 192.168.50.1/24 was removed from $NIC right after being added." >&2
  echo "Something is still managing this NIC. Check: journalctl -u NetworkManager -n 30" >&2
  exit 1; }

# Spec §11.2 commissioning aliases: reach cameras holding a foreign static
# address from a previous installation, so the generic ONVIF path can see them.
# PhysicalEthernetProvider enumerates every IPv4 address on the NIC, so each
# alias becomes another network to sweep.
#
# The spec also lists 169.254.1.250/16. It is deliberately OMITTED: a /16 is
# 65533 hosts, and deriveNetwork() THROWS above SCANNER_MAX_HOSTS (default 256,
# 1024 in production). listNetworks() does not catch it, so that one alias would
# abort the whole scan rather than degrade it. Link-local cameras (Axis,
# Vivotek) need vendor L2 discovery (§6.2, phase 2) or a raised cap.
for alias in 192.168.1.250/24 192.168.0.250/24; do
  if ip -4 addr show dev "$NIC" | grep -q "${alias%/*}"; then
    echo "alias $alias already on $NIC"
  else
    ip addr add "$alias" dev "$NIC"
    echo "added commissioning alias $alias to $NIC"
  fi
done

echo "starting dnsmasq on $NIC — power-cycle the camera now; Ctrl-C to stop"
echo
exec dnsmasq --conf-file="$CONF" --interface="$NIC" --no-daemon --log-facility=-
