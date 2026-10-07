<?xml version="1.0" encoding="UTF-8"?>
<!-- Círculos de área proporcional a la cantidad de proveedores (diámetro = 5 + √n) -->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>proveedores_por_localidad</Name>
    <UserStyle>
      <Title>Proveedores por localidad</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title>Proveedores</Title>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill>
                  <CssParameter name="fill">#21708c</CssParameter>
                  <CssParameter name="fill-opacity">0.6</CssParameter>
                </Fill>
                <Stroke>
                  <CssParameter name="stroke">#ffffff</CssParameter>
                  <CssParameter name="stroke-width">1.5</CssParameter>
                </Stroke>
              </Mark>
              <Size>
                <ogc:Add>
                  <ogc:Literal>5</ogc:Literal>
                  <ogc:Function name="sqrt">
                    <ogc:PropertyName>cant_proveedores</ogc:PropertyName>
                  </ogc:Function>
                </ogc:Add>
              </Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
        <!-- Los más grandes abajo, para que no tapen a los chicos -->
        <VendorOption name="sortBy">cant_proveedores D</VendorOption>
      </FeatureTypeStyle>
      <FeatureTypeStyle>
        <!-- Nombres: las localidades grandes siempre, el resto al acercarse -->
        <Rule>
          <ogc:Filter>
            <ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyName>cant_proveedores</ogc:PropertyName>
              <ogc:Literal>200</ogc:Literal>
            </ogc:PropertyIsGreaterThanOrEqualTo>
          </ogc:Filter>
          <TextSymbolizer>
            <Label><ogc:PropertyName>localidad</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">SansSerif</CssParameter>
              <CssParameter name="font-size">12</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>0.5</AnchorPointY></AnchorPoint>
              </PointPlacement>
            </LabelPlacement>
            <Halo>
              <Radius>2</Radius>
              <Fill><CssParameter name="fill">#ffffff</CssParameter></Fill>
            </Halo>
            <Fill><CssParameter name="fill">#13262e</CssParameter></Fill>
            <Priority><ogc:PropertyName>cant_proveedores</ogc:PropertyName></Priority>
          </TextSymbolizer>
        </Rule>
        <Rule>
          <ogc:Filter>
            <ogc:PropertyIsLessThan>
              <ogc:PropertyName>cant_proveedores</ogc:PropertyName>
              <ogc:Literal>200</ogc:Literal>
            </ogc:PropertyIsLessThan>
          </ogc:Filter>
          <MaxScaleDenominator>2500000</MaxScaleDenominator>
          <TextSymbolizer>
            <Label><ogc:PropertyName>localidad</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">SansSerif</CssParameter>
              <CssParameter name="font-size">11</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0</AnchorPointX><AnchorPointY>0.5</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>8</DisplacementX><DisplacementY>0</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Halo>
              <Radius>1.5</Radius>
              <Fill><CssParameter name="fill">#ffffff</CssParameter></Fill>
            </Halo>
            <Fill><CssParameter name="fill">#4d646e</CssParameter></Fill>
            <Priority><ogc:PropertyName>cant_proveedores</ogc:PropertyName></Priority>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
