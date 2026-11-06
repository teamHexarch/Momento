#!/bin/bash
# First-time setup of a fresh AWS Lightsail server (Ubuntu 24.04) for the Momento API.
# Paste this whole file into Lightsail's "Launch script" box when creating the instance.
# It installs Docker and Git, adds swap memory, and downloads the code. It never contains secrets:
# the settings go into /opt/momento-config/server.env afterwards (see README.md).
set -euo pipefail
exec > /var/log/momento-setup.log 2>&1

# 2 GB of swap, so building and resizing big photos never runs a 1 GB server out of memory
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 git
systemctl enable --now docker
usermod -aG docker ubuntu || true

# The code (public repository; no passwords needed)
if [ ! -d /opt/momento ]; then
  git clone https://github.com/teamHexarch/Momento.git /opt/momento
fi

# Settings live outside the code, readable only by root
mkdir -p /opt/momento-config
chmod 700 /opt/momento-config
[ -f /opt/momento-config/server.env ] || install -m 600 /dev/null /opt/momento-config/server.env
[ -f /opt/momento-config/domains ] || echo 'api.hexarch.org' > /opt/momento-config/domains

# Short command for updates: "sudo momento-update" gets the latest code, then runs deploy/update.sh
cat > /usr/local/bin/momento-update <<'EOF'
#!/bin/bash
set -euo pipefail
cd /opt/momento
git pull --ff-only
exec bash /opt/momento/Server/deploy/update.sh "$@"
EOF
chmod 755 /usr/local/bin/momento-update

echo "Momento setup finished. Next: fill in /opt/momento-config/server.env, then run: sudo momento-update"
