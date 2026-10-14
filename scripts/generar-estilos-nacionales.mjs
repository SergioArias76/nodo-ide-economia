#!/usr/bin/env node
// Genera los estilos propios de las capas nacionales de puntos cuyo estilo de origen no dice qué son
// (un punto o un cuadrado de color): un círculo con el color del tema del visor y el dibujo de la
// biblioteca Lucide (la misma de los íconos del portal), como los de proveedores.
// Escribe geoserver/estilos/nacional/<tabla>.sld y <tabla>.svg; los publica scripts/publicar-geoserver.sh
// y scripts/importar-capas-nacionales.mjs los usa en lugar del estilo de origen.
// Uso: node scripts/generar-estilos-nacionales.mjs   (requiere portal/node_modules)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SALIDA = `${RAIZ}geoserver/estilos/nacional`;
const ESCALA_ICONOS = 300000; // más cerca que 1:300.000, ícono; más lejos, punto

// tabla | título | ícono de Lucide | color del tema (franja del isotipo) | color del dibujo
const CAPAS = [
  ["establecimiento_educativo", "Establecimiento educativo", "school", "#ffb109", "#13262e"],
  ["institucion_universitaria", "Institución universitaria", "graduation-cap", "#ffb109", "#13262e"],
  ["asentamientos_humanos_de_la_republica_argentina_bahra", "Asentamiento humano", "house", "#ffb109", "#13262e"],
  ["estacion_meteorologica", "Estación meteorológica", "cloud-sun", "#ffc815", "#13262e"],
  ["estacion_de_omnibus", "Estación de ómnibus", "bus-front", "#5894a7", "#ffffff"],
  ["dique", "Dique", "dam", "#21708c", "#ffffff"],
  ["gobierno_local", "Gobierno local", "landmark", "#21708c", "#ffffff"],
];

// Los íconos de lucide-react traen sus elementos SVG como datos: [etiqueta, atributos][]
function elementos(icono) {
  const js = readFileSync(`${RAIZ}portal/node_modules/lucide-react/dist/esm/icons/${icono}.mjs`, "utf8");
  const datos = js.match(/const __iconData = (\{[\s\S]*?\n\});/)[1];
  // eslint-disable-next-line no-new-func -- objeto literal del paquete instalado
  return Function(`return ${datos}`)().node.map(([etiqueta, { key, ...a }]) =>
    `<${etiqueta} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`,
  );
}

const svg = (titulo, icono, fondo, trazo) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <!-- ${titulo}: Lucide "${icono}" sobre el color del tema -->
  <circle cx="12" cy="12" r="11.2" fill="${fondo}" stroke="#ffffff" stroke-width="1.6"/>
  <g transform="translate(5.4 5.4) scale(0.55)" fill="none" stroke="${trazo}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    ${elementos(icono).join("\n    ")}
  </g>
</svg>
`;

const sld = (tabla, titulo, fondo) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por scripts/generar-estilos-nacionales.mjs. De lejos, punto del color del tema; de cerca, ícono (${tabla}.svg) -->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>${tabla}</Name>
    <UserStyle>
      <Title>${titulo}</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title>${titulo}</Title>
          <MinScaleDenominator>${ESCALA_ICONOS}</MinScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">${fondo}</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#ffffff</CssParameter>
                  <CssParameter name="stroke-width">1.2</CssParameter>
                </Stroke>
              </Mark>
              <Size>8</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
        <Rule>
          <Title>${titulo}</Title>
          <MaxScaleDenominator>${ESCALA_ICONOS}</MaxScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <ExternalGraphic>
                <OnlineResource xlink:type="simple" xlink:href="${tabla}.svg"/>
                <Format>image/svg+xml</Format>
              </ExternalGraphic>
              <Size>22</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
`;

for (const [tabla, titulo, icono, fondo, trazo] of CAPAS) {
  writeFileSync(`${SALIDA}/${tabla}.svg`, svg(titulo, icono, fondo, trazo));
  writeFileSync(`${SALIDA}/${tabla}.sld`, sld(tabla, titulo, fondo));
  console.log(`  ✓ ${tabla} (${icono})`);
}
