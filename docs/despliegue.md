# Despliegue en el servidor

Servidor objetivo: Ubuntu Server 24.04 LTS, 2 vCPU, 8 GB RAM, 100 GB.

## 1. Preparación del host

```bash
sudo apt update && sudo apt upgrade -y
# Docker oficial
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Elasticsearch lo requiere
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf
sudo sysctl --system

# Firewall: solo SSH y web
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

## 2. Código y configuración

```bash
sudo mkdir -p /opt/nodo-ide && sudo chown $USER /opt/nodo-ide
git clone <url-del-repo> /opt/nodo-ide
cd /opt/nodo-ide
cp .env.example .env && chmod 600 .env   # completar contraseñas y DOMINIO
```

## 3. Certificado TLS

Colocar en `nginx/certs/`:

- `fullchain.pem`
- `privkey.pem`

Origen a definir con la DGOI (wildcard provincial o Let's Encrypt con certbot).

## 4. Arranque

```bash
docker compose pull
docker compose up -d
docker compose logs -f
```

## 5. Post-instalación

- [ ] Cambiar contraseña de `admin` en GeoNetwork (por defecto `admin/admin`).
- [ ] Verificar login de GeoServer con las credenciales del `.env`.
- [ ] En GeoServer: crear workspace `economia` y store PostGIS (ver [geoserver/README.md](../geoserver/README.md)).
- [ ] Programar backup diario: `scripts/backup.sh` en cron.

## Actualizaciones

1. Pedir snapshot a la DGOI.
2. Ejecutar `scripts/backup.sh`.
3. Cambiar versión en `.env`, `docker compose pull && docker compose up -d`.
4. Verificar servicios (GetCapabilities WMS/WFS, catálogo).
