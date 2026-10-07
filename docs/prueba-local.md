# Prueba local (Windows)

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) con backend WSL 2.
- Git Bash (viene con Git for Windows) para correr los scripts `.sh`.
- ~8 GB de RAM libres para el stack completo.

## 1. Preparar

En Git Bash, desde la raíz del repo:

```bash
cp .env.example .env              # en local se pueden dejar las contraseñas de ejemplo
bash scripts/generar-cert-dev.sh  # certificado autofirmado para https://localhost
```

## 2. Levantar el stack

```bash
docker compose up -d --build
docker compose ps
```

La primera vez descarga ~3 GB de imágenes. GeoServer y GeoNetwork tardan 1–3 minutos en arrancar; seguir con `docker compose logs -f geonetwork`.

| Qué | URL | Usuario |
|---|---|---|
| Portal | https://localhost/ | – |
| GeoServer | https://localhost/geoserver/ | `.env` → `GEOSERVER_ADMIN_*` |
| GeoNetwork | https://localhost/geonetwork/ | `admin` / `admin` |

El navegador va a advertir por el certificado autofirmado: aceptar y continuar.

## 3. Cargar proveedores

Copiar `QGIS_proveedores_puntos.geojson` en `datos/fuentes/proveedores/` y:

```bash
bash scripts/cargar-proveedores.sh
```

Al final muestra un resumen: cantidad por tipo de persona, por precisión y cuántos quedan publicados.

## 4. Publicar en GeoServer

Seguir [geoserver/README.md](../geoserver/README.md): workspace `economia`, store PostGIS con `geoserver_ro` y publicar las dos vistas. Después recargar https://localhost/visor.

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| Puerto 80 o 443 ocupado | Otro servicio (IIS, Skype, otro contenedor). Liberarlo o cambiar `ports` en `docker-compose.yml` |
| `elasticsearch` se reinicia | Falta memoria para WSL: aumentarla en `%UserProfile%\.wslconfig` (`memory=8GB`) |
| Cambié contraseñas en `.env` y la base no las toma | Los scripts de `postgis/initdb` corren solo la primera vez: `docker compose down -v` (borra los datos) y volver a levantar |
| Visor sin capas de proveedores | Las vistas aún no están publicadas en GeoServer (paso 4) |

## Apagar

```bash
docker compose down       # conserva los datos
docker compose down -v    # borra también los volúmenes (base, GeoServer, catálogo)
```
