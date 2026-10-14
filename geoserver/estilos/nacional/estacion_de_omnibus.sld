<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por scripts/generar-estilos-nacionales.mjs. De lejos, punto del color del tema; de cerca, ícono (estacion_de_omnibus.svg) -->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>estacion_de_omnibus</Name>
    <UserStyle>
      <Title>Estación de ómnibus</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title>Estación de ómnibus</Title>
          <MinScaleDenominator>300000</MinScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#5894a7</CssParameter></Fill>
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
          <Title>Estación de ómnibus</Title>
          <MaxScaleDenominator>300000</MaxScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <ExternalGraphic>
                <OnlineResource xlink:type="simple" xlink:href="estacion_de_omnibus.svg"/>
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
