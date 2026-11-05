// Carga en GeoNetwork las fichas de metadatos (ISO 19139, perfil IDERA) de las capas del nodo, con sus
// enlaces OGC:WMS y OGC:WFS. Cada ficha tiene un identificador fijo: correrlo de nuevo la actualiza
// (no la duplica) y queda pública. Las fichas se arman acá, desde CAPAS; para cambiar un texto, se edita
// este archivo y se vuelve a correr.
//
// Uso (con el stack levantado, desde la raíz del repo; contraseña de admin en .env):
//   node scripts/cargar-metadatos-geonetwork.mjs            # carga o actualiza
//   node scripts/cargar-metadatos-geonetwork.mjs --ver      # solo imprime el XML de la primera ficha
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

function leerEnv() {
  const env = {};
  const archivo = `${RAIZ}.env`;
  if (!existsSync(archivo)) return env;
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}
const ENV = { ...leerEnv(), ...process.env };
const DOMINIO = ENV.DOMINIO || "localhost";
const API = ENV.GEONETWORK_API || `https://${DOMINIO}/geonetwork/srv/api`;
const PUBLICO = `https://${DOMINIO}`;
// Certificado autofirmado solo en desarrollo
if (DOMINIO === "localhost") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const HOY = new Date().toISOString().slice(0, 10);

// Responsable de los datos, con el contacto que publica el Registro de Proveedores
const RESPONSABLE = {
  area: "Área de Transparencia y Normatización de Contrataciones Públicas",
  organizacion:
    "Oficina Provincial de Contrataciones - Subsecretaría de Coordinación Financiera - Ministerio de Economía de la Provincia del Chubut",
  provincia: "Chubut",
  telefono: "+54 280 4485422",
  correo: "registrodeproveedores@chubut.gob.ar",
  horario: "Lunes a viernes de 8 a 14 h",
  pais: "Argentina",
};

const LICENCIA =
  "Datos abiertos publicados bajo la licencia Creative Commons Atribución 4.0 Internacional (CC BY 4.0): " +
  "se pueden copiar, redistribuir y transformar, también con fines comerciales, citando la fuente: " +
  "Nodo IDE Economía Chubut, Oficina Provincial de Contrataciones, Ministerio de Economía de la Provincia del Chubut.";

const LINAJE =
  "Proveedores inscriptos en el Registro Provincial de Proveedores del Estado: la base es el padrón del " +
  "Sistema Integrado de Administración Financiera y Control (SIAFyC) y los datos recientes de la plataforma " +
  "del Registro de Proveedores (https://proveedores.chubut.gob.ar), que tienen prioridad por CUIT. El " +
  "domicilio legal se geocodificó con el Servicio de Normalización de Datos Geográficos de Argentina " +
  "(Georef), OpenStreetMap y los puntos marcados por los propios proveedores; cada punto indica con qué " +
  "precisión se ubicó (calle y altura, calle, barrio, centro de la localidad u otros). La ubicación no " +
  "tiene valor legal: ante cualquier diferencia vale el registro de origen.";

// Extensión de los datos (proveedores de todo el país, con la mayoría en el Chubut)
const EXTENSION = { oeste: -72.3, este: -54.5, sur: -54.9, norte: -24.1 };

const CAPAS = [
  {
    uuid: "6f1c9a2e-5b8d-4c3e-9a71-0e2d4b6f8a01",
    capa: "economia:proveedores_radicacion",
    titulo: "Proveedores del Estado de la Provincia del Chubut",
    resumen:
      "Ubicación del domicilio legal de cada proveedor inscripto en el Registro Provincial de Proveedores " +
      "del Estado del Chubut, con su tipo de persona (física o jurídica), CUIT, rubros, localidad, " +
      "departamento y la precisión con que se ubicó. Incluye proveedores radicados en otras provincias.",
    proposito:
      "Conocer dónde están los proveedores del Estado provincial y qué rubros cubren en cada localidad, " +
      "para la gestión de compras, la planificación y la consulta pública.",
    palabras: ["proveedores del Estado", "contrataciones públicas", "compras públicas", "registro de proveedores", "rubros", "domicilio legal", "Chubut"],
    tipo: "point",
  },
  {
    uuid: "6f1c9a2e-5b8d-4c3e-9a71-0e2d4b6f8a02",
    capa: "economia:proveedores_por_localidad",
    titulo: "Proveedores del Estado por localidad - Provincia del Chubut",
    resumen:
      "Cantidad de proveedores inscriptos en el Registro Provincial de Proveedores del Estado del Chubut " +
      "por localidad, separados en personas jurídicas y físicas. El punto de cada localidad es el centro " +
      "de los domicilios de sus proveedores.",
    proposito:
      "Ver de un vistazo cómo se distribuye la oferta de proveedores del Estado en el territorio.",
    palabras: ["proveedores del Estado", "contrataciones públicas", "estadística", "localidades", "Chubut"],
    tipo: "point",
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const texto = (s) => `<gco:CharacterString>${esc(s)}</gco:CharacterString>`;
const codigo = (lista, valor) =>
  `<gmd:${lista} codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#${lista}" codeListValue="${valor}"/>`;

function contacto(rol) {
  return `<gmd:CI_ResponsibleParty>
        <gmd:individualName>${texto(RESPONSABLE.area)}</gmd:individualName>
        <gmd:organisationName>${texto(RESPONSABLE.organizacion)}</gmd:organisationName>
        <gmd:contactInfo><gmd:CI_Contact>
          <gmd:phone><gmd:CI_Telephone><gmd:voice>${texto(RESPONSABLE.telefono)}</gmd:voice></gmd:CI_Telephone></gmd:phone>
          <gmd:address><gmd:CI_Address>
            <gmd:administrativeArea>${texto(RESPONSABLE.provincia)}</gmd:administrativeArea>
            <gmd:country>${texto(RESPONSABLE.pais)}</gmd:country>
            <gmd:electronicMailAddress>${texto(RESPONSABLE.correo)}</gmd:electronicMailAddress>
          </gmd:CI_Address></gmd:address>
          <gmd:onlineResource><gmd:CI_OnlineResource>
            <gmd:linkage><gmd:URL>${esc(PUBLICO)}/</gmd:URL></gmd:linkage>
          </gmd:CI_OnlineResource></gmd:onlineResource>
          <gmd:hoursOfService>${texto(RESPONSABLE.horario)}</gmd:hoursOfService>
        </gmd:CI_Contact></gmd:contactInfo>
        <gmd:role>${codigo("CI_RoleCode", rol)}</gmd:role>
      </gmd:CI_ResponsibleParty>`;
}

function enlace(protocolo, url, nombre, descripcion) {
  return `<gmd:onLine><gmd:CI_OnlineResource>
          <gmd:linkage><gmd:URL>${esc(url)}</gmd:URL></gmd:linkage>
          <gmd:protocol>${texto(protocolo)}</gmd:protocol>
          <gmd:name>${texto(nombre)}</gmd:name>
          <gmd:description>${texto(descripcion)}</gmd:description>
        </gmd:CI_OnlineResource></gmd:onLine>`;
}

function ficha(c) {
  const corto = c.capa.split(":")[1];
  const wms = `${PUBLICO}/geoserver/economia/wms`;
  const wfs = `${PUBLICO}/geoserver/economia/wfs`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco"
    xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gmd:fileIdentifier>${texto(c.uuid)}</gmd:fileIdentifier>
  <gmd:language><gmd:LanguageCode codeList="http://www.loc.gov/standards/iso639-2/" codeListValue="spa"/></gmd:language>
  <gmd:characterSet>${codigo("MD_CharacterSetCode", "utf8")}</gmd:characterSet>
  <gmd:hierarchyLevel>${codigo("MD_ScopeCode", "dataset")}</gmd:hierarchyLevel>
  <gmd:contact>${contacto("pointOfContact")}</gmd:contact>
  <gmd:dateStamp><gco:Date>${HOY}</gco:Date></gmd:dateStamp>
  <gmd:metadataStandardName>${texto("ISO 19115:2003/19139 - Perfil de Metadatos IDERA")}</gmd:metadataStandardName>
  <gmd:metadataStandardVersion>${texto("1.0")}</gmd:metadataStandardVersion>
  <gmd:referenceSystemInfo><gmd:MD_ReferenceSystem><gmd:referenceSystemIdentifier><gmd:RS_Identifier>
    <gmd:code>${texto("EPSG:4326")}</gmd:code>
    <gmd:codeSpace>${texto("EPSG")}</gmd:codeSpace>
  </gmd:RS_Identifier></gmd:referenceSystemIdentifier></gmd:MD_ReferenceSystem></gmd:referenceSystemInfo>
  <gmd:identificationInfo><gmd:MD_DataIdentification>
    <gmd:citation><gmd:CI_Citation>
      <gmd:title>${texto(c.titulo)}</gmd:title>
      <gmd:date><gmd:CI_Date>
        <gmd:date><gco:Date>${HOY}</gco:Date></gmd:date>
        <gmd:dateType>${codigo("CI_DateTypeCode", "revision")}</gmd:dateType>
      </gmd:CI_Date></gmd:date>
      <gmd:identifier><gmd:MD_Identifier><gmd:code>${texto(c.capa)}</gmd:code></gmd:MD_Identifier></gmd:identifier>
    </gmd:CI_Citation></gmd:citation>
    <gmd:abstract>${texto(c.resumen)}</gmd:abstract>
    <gmd:purpose>${texto(c.proposito)}</gmd:purpose>
    <gmd:status>${codigo("MD_ProgressCode", "onGoing")}</gmd:status>
    <gmd:pointOfContact>${contacto("custodian")}</gmd:pointOfContact>
    <gmd:resourceMaintenance><gmd:MD_MaintenanceInformation>
      <gmd:maintenanceAndUpdateFrequency>${codigo("MD_MaintenanceFrequencyCode", "continual")}</gmd:maintenanceAndUpdateFrequency>
    </gmd:MD_MaintenanceInformation></gmd:resourceMaintenance>
    <gmd:graphicOverview><gmd:MD_BrowseGraphic>
      <gmd:fileName>${texto(`${PUBLICO}/api/miniatura/${corto}`)}</gmd:fileName>
      <gmd:fileDescription>${texto("Vista previa sobre la provincia del Chubut")}</gmd:fileDescription>
      <gmd:fileType>${texto("image/png")}</gmd:fileType>
    </gmd:MD_BrowseGraphic></gmd:graphicOverview>
    <gmd:descriptiveKeywords><gmd:MD_Keywords>
      ${c.palabras.map((p) => `<gmd:keyword>${texto(p)}</gmd:keyword>`).join("\n      ")}
      <gmd:type>${codigo("MD_KeywordTypeCode", "theme")}</gmd:type>
    </gmd:MD_Keywords></gmd:descriptiveKeywords>
    <gmd:descriptiveKeywords><gmd:MD_Keywords>
      <gmd:keyword>${texto("Chubut")}</gmd:keyword>
      <gmd:keyword>${texto("Argentina")}</gmd:keyword>
      <gmd:type>${codigo("MD_KeywordTypeCode", "place")}</gmd:type>
    </gmd:MD_Keywords></gmd:descriptiveKeywords>
    <gmd:resourceConstraints><gmd:MD_LegalConstraints>
      <gmd:useLimitation>${texto(LICENCIA)}</gmd:useLimitation>
      <gmd:accessConstraints>${codigo("MD_RestrictionCode", "otherRestrictions")}</gmd:accessConstraints>
      <gmd:useConstraints>${codigo("MD_RestrictionCode", "license")}</gmd:useConstraints>
      <gmd:otherConstraints>${texto("Sin restricciones de acceso. Licencia CC BY 4.0: https://creativecommons.org/licenses/by/4.0/deed.es")}</gmd:otherConstraints>
    </gmd:MD_LegalConstraints></gmd:resourceConstraints>
    <gmd:spatialRepresentationType>${codigo("MD_SpatialRepresentationTypeCode", "vector")}</gmd:spatialRepresentationType>
    <gmd:language><gmd:LanguageCode codeList="http://www.loc.gov/standards/iso639-2/" codeListValue="spa"/></gmd:language>
    <gmd:characterSet>${codigo("MD_CharacterSetCode", "utf8")}</gmd:characterSet>
    <gmd:topicCategory><gmd:MD_TopicCategoryCode>economy</gmd:MD_TopicCategoryCode></gmd:topicCategory>
    <gmd:extent><gmd:EX_Extent>
      <gmd:description>${texto("Provincia del Chubut y proveedores radicados en el resto de la Argentina")}</gmd:description>
      <gmd:geographicElement><gmd:EX_GeographicBoundingBox>
        <gmd:westBoundLongitude><gco:Decimal>${EXTENSION.oeste}</gco:Decimal></gmd:westBoundLongitude>
        <gmd:eastBoundLongitude><gco:Decimal>${EXTENSION.este}</gco:Decimal></gmd:eastBoundLongitude>
        <gmd:southBoundLatitude><gco:Decimal>${EXTENSION.sur}</gco:Decimal></gmd:southBoundLatitude>
        <gmd:northBoundLatitude><gco:Decimal>${EXTENSION.norte}</gco:Decimal></gmd:northBoundLatitude>
      </gmd:EX_GeographicBoundingBox></gmd:geographicElement>
    </gmd:EX_Extent></gmd:extent>
  </gmd:MD_DataIdentification></gmd:identificationInfo>
  <gmd:distributionInfo><gmd:MD_Distribution>
    <gmd:distributionFormat><gmd:MD_Format>
      <gmd:name>${texto("GeoJSON, CSV, Shapefile (WFS)")}</gmd:name>
      <gmd:version>${texto("-")}</gmd:version>
    </gmd:MD_Format></gmd:distributionFormat>
    <gmd:transferOptions><gmd:MD_DigitalTransferOptions>
        ${enlace("OGC:WMS", wms, c.capa, "Servicio de mapas (WMS)")}
        ${enlace("OGC:WFS", wfs, c.capa, "Servicio de entidades vectoriales para consulta y descarga (WFS)")}
        ${enlace("WWW:LINK", `${PUBLICO}/visor?capas=${corto}`, "Ver en el visor del Nodo IDE Economía Chubut", "Visor de mapas")}
    </gmd:MD_DigitalTransferOptions></gmd:transferOptions>
  </gmd:MD_Distribution></gmd:distributionInfo>
  <gmd:dataQualityInfo><gmd:DQ_DataQuality>
    <gmd:scope><gmd:DQ_Scope><gmd:level>${codigo("MD_ScopeCode", "dataset")}</gmd:level></gmd:DQ_Scope></gmd:scope>
    <gmd:lineage><gmd:LI_Lineage><gmd:statement>${texto(LINAJE)}</gmd:statement></gmd:LI_Lineage></gmd:lineage>
  </gmd:DQ_DataQuality></gmd:dataQualityInfo>
</gmd:MD_Metadata>
`;
}

if (process.argv.includes("--ver")) {
  process.stdout.write(ficha(CAPAS[0]));
  process.exit(0);
}

// GeoNetwork exige el token XSRF de su cookie en cada escritura
const usuario = "admin";
const clave = ENV.GEONETWORK_ADMIN_PASSWORD;
if (!clave) throw new Error("Falta GEONETWORK_ADMIN_PASSWORD en .env");
const auth = "Basic " + Buffer.from(`${usuario}:${clave}`).toString("base64");

const me = await fetch(`${API}/me`, { headers: { Authorization: auth, Accept: "application/json" } });
const xsrf = (me.headers.getSetCookie?.() ?? [me.headers.get("set-cookie") ?? ""])
  .map((c) => c.match(/XSRF-TOKEN=([^;]+)/)?.[1])
  .find(Boolean);
if (!me.ok || !xsrf) throw new Error(`No se pudo ingresar a GeoNetwork (HTTP ${me.status}); ¿corriste scripts/configurar-geonetwork.sh?`);

let errores = 0;
for (const c of CAPAS) {
  const q = new URLSearchParams({ metadataType: "METADATA", uuidProcessing: "OVERWRITE", publishToAll: "true" });
  const r = await fetch(`${API}/records?${q}`, {
    method: "PUT",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Accept-Language": "es",
      "Content-Type": "application/xml",
      "X-XSRF-TOKEN": xsrf,
      Cookie: `XSRF-TOKEN=${xsrf}`,
    },
    body: ficha(c),
  });
  const cuerpo = await r.text();
  if (r.ok && !/"errors":\s*\[\s*\{/.test(cuerpo)) console.log(`  ✓ ${c.titulo}`);
  else {
    errores++;
    console.error(`  ✗ ${c.titulo} (HTTP ${r.status}): ${cuerpo.slice(0, 400)}`);
  }
}
process.exit(errores ? 1 : 0);
