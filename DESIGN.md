---
name: IDE Economía Chubut
description: Portal y visor de mapas del nodo IDE del Ministerio de Economía del Chubut
colors:
  sol: "#ffc815"
  sol-hondo: "#ffb109"
  meseta: "#ff8540"
  meseta-hondo: "#ff682c"
  mar: "#5894a7"
  mar-hondo: "#21708c"
  tinta: "#13262e"
  texto: "#0a0a0a"
  tenue: "#4b5563"
  borde: "#e5e7eb"
  superficie: "#f3f4f6"
  fondo: "#ffffff"
  petroleo: "#16424f"
  celeste: "#f5fafb"
  fondo-oscuro: "#17191c"
  superficie-oscura: "#212327"
  borde-oscuro: "#33363b"
  texto-oscuro: "#ececec"
  tenue-oscuro: "#a8abb0"
  acento-oscuro: "#7cc0d6"
typography:
  marca:
    fontFamily: "Rubik, Public Sans, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.1
  titulo:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
  ficha:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.375
  cuerpo:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.375
  etiqueta:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  boton-primario:
    backgroundColor: "{colors.mar-hondo}"
    textColor: "{colors.fondo}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  boton-icono-activo:
    backgroundColor: "{colors.mar-hondo}"
    textColor: "{colors.fondo}"
    rounded: "{rounded.lg}"
    size: "36px"
  boton-icono:
    textColor: "{colors.tinta}"
    rounded: "{rounded.lg}"
    size: "36px"
  campo:
    backgroundColor: "{colors.fondo}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  tarjeta:
    backgroundColor: "{colors.fondo}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.xl}"
  mosaico-tema:
    rounded: "{rounded.lg}"
    size: "32px"
  contador-tema:
    rounded: "{rounded.pill}"
    typography: "{typography.etiqueta}"
---

# Design System: IDE Economía Chubut

## Overview

**Creative North Star: "Franjas del territorio"**

El isotipo del Gobierno del Chubut dibuja la provincia en franjas: sol, meseta y mar. El sistema usa esas franjas como código de color de los datos. Cada tema de capas toma una franja, y esa franja aparece donde el tema aparece: su mosaico en el panel, su contador de capas encendidas, el borde de la ficha de consulta y el aro del dato consultado en el mapa. El visitante reconoce un tema antes de leer su nombre.

La interfaz es una herramienta de trabajo (modo Operate). Lleva la disposición familiar de los visores de IDE: panel de capas a la izquierda, herramientas arriba a la derecha y zoom abajo. Las tarjetas son blancas y flotan sobre el mapa. El color de marca hace trabajo concreto: identifica temas, marca acciones y selección, y aparece como franja de seis colores sobre el logotipo. No decora.

**Key Characteristics:**
- Base clara de neutros grises (los del Registro de Proveedores). El portal abre siempre en claro, como los sitios del Gobierno del Chubut; el oscuro (gris grafito) se elige con el botón de tema o con "Sistema" en Accesibilidad.
- Acento único para acciones y selección: mar hondo.
- Franjas del isotipo reservadas para identificar temas y para la marca.
- Íconos temáticos de Lucide (la familia de los botones), en tinta o blanco sobre su franja.
- Public Sans en toda la interfaz; Rubik solo en el logotipo.

## Colors

Una paleta de identidad provincial: tres pares de franjas cálidas y frías sobre neutros fríos.

### Primary
- **Mar hondo**: acciones primarias, botones activos, foco, casillas y deslizadores. Con texto blanco da 5,6:1. Es también la franja de Hidrografía y Demarcación.

### Secondary
- **Meseta y meseta honda**: franjas de Industria y Servicios, Geografía física y Biota (meseta) y de Proveedores del Estado (meseta honda). Meseta honda es también el color de los puntos de proveedores en el mapa y de los dibujos del usuario.

### Tertiary
- **Sol y sol hondo**: franjas de Clima y meteorología (sol), Geografía social y Defensa y Seguridad (sol hondo). La selección de texto usa sol al 45 %.
- **Mar**: franja de Transporte y de Unidades geoestadísticas; color de las mediciones junto con mar hondo.

### Neutral
- **Texto**: texto principal.
- **Tinta**: íconos y texto sobre franjas cálidas (también sobre el naranja de los botones del sitio, 5,4:1) y avisos sobre el mapa.
- **Tenue**: texto secundario y etiquetas de campo (7,6:1 sobre blanco).
- **Borde**: divisores y contornos de tarjetas y campos.
- **Superficie**: hover de filas y fondos secundarios.
- **Fondo**: tarjetas y paneles.
- En oscuro: fondo oscuro, superficie oscura, borde oscuro, texto oscuro, tenue oscuro y acento oscuro reemplazan a sus pares claros.

### Named Rules
**The Una Franja por Tema Rule.** Cada tema de capas tiene una sola franja (`TEMAS` en `portal/src/lib/config.ts`), y esa franja es la única forma de color del tema. Un tema nuevo elige una franja existente; no inventa colores.

**The Tinta sobre Sol Rule.** Sobre sol y meseta el ícono y el número van en tinta. Sobre mar van en blanco. Las franjas cálidas nunca llevan texto blanco.

**The Acento Hace Trabajo Rule.** Mar hondo marca acciones, selección y foco, nada más. Las franjas no se usan como fondo de botones.

## Typography

**Display Font:** Rubik (con Public Sans), solo en el logotipo "Ministerio de Economía · Gobierno del Chubut · IDE".
**Body Font:** Public Sans (con system-ui), autoalojada, en pesos 400, 500, 600 y 700.

**Character:** Public Sans es la tipografía institucional: neutra, legible y con cifras tabulares para coordenadas, conteos y CUIT. Rubik aparece solo en la firma del Ministerio.

### Hierarchy
- **Marca** (600, 0.95rem, 1.1): nombre del Ministerio en la tarjeta de marca. La línea secundaria va en 500 a 0.75rem.
- **Título** (600, 1rem, 1.25): encabezados de panel ("Capas", "Mapa base").
- **Ficha** (600, 0.9375rem, 1.375): nombre del dato consultado.
- **Cuerpo** (400, 0.875rem, 1.375): nombres de capas, que pasan a 500 al estar encendidas, y valores de la ficha.
- **Etiqueta** (400, 0.75rem): etiquetas de campo, notas y metadatos. Va en minúscula y sin tracking.

### Named Rules
**The Sin Volanta Rule.** Ningún encabezado lleva rótulo en mayúsculas encima. La capa de origen de un dato va debajo del título, junto al mosaico del tema.

## Layout

El mapa ocupa toda la pantalla (`h-dvh`). La interfaz flota encima en tarjetas con 12px de margen al borde:
- Arriba a la izquierda, la tarjeta de marca con el buscador. Debajo, el riel de íconos y el panel activo (ancho `min(24rem, 100vw - 1.5rem)`).
- Arriba a la derecha, la barra de herramientas. La columna de dibujo se despliega debajo.
- Abajo a la derecha, el zoom con su nivel. Abajo a la izquierda, la escala y las coordenadas.

En celular (menos de 640px) la barra de herramientas baja al borde inferior, en una sola fila con desplazamiento, y se oculta con el panel abierto. La columna de dibujo se alinea a la derecha. Las coordenadas se ocultan; la escala queda.

Ritmo: 4, 8, 12 y 16px. Las filas de capas son densas (4px vertical) y los grupos se separan con divisores.

## Elevation & Depth

Hay un solo nivel de elevación: todo lo que flota sobre el mapa usa la misma sombra suave con desplazamiento. Dentro de una tarjeta no hay sombras; la jerarquía viene del divisor y de la superficie al hover.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0 1px 2px rgb(19 38 46 / 0.08), 0 8px 24px -4px rgb(19 38 46 / 0.16)`): tarjeta de marca, riel, panel, barra de herramientas, zoom, escala y ficha. En oscuro se oscurece (0.3 / 0.45 sobre negro).

### Named Rules
**The Un Solo Piso Rule.** Nada se apila sobre una tarjeta flotante con otra sombra. No hay tarjetas dentro de tarjetas.

## Shapes

Esquinas suaves y consistentes:
- 12px en tarjetas flotantes y en la ficha.
- 8px en botones de ícono, mosaicos de tema y filas.
- 6px en campos y botones de texto.
- Píldora en contadores y etiquetas de rubros.

La ficha de consulta tiene un pico rotado que apunta al lugar consultado. Las franjas de color aparecen solo como filetes de 3px en el borde superior: seis colores en la marca, uno en la ficha.

## Components

### Buttons
- **Shape:** 8px los de ícono (36px en barras, 28px en filas), 6px los de texto.
- **Primario:** fondo mar hondo con texto blanco, de 6 a 12px de relleno. Al hover baja la opacidad a 90 %.
- **Ícono:** transparente con texto en tinta. Al hover toma la superficie. Activo: mar hondo con ícono blanco y `aria-pressed`.
- **Focus:** contorno de 2px en el acento, con 1 a 2px de separación.

### Chips
- **Contador de tema:** píldora en la franja del tema con número en tinta o blanco (ver Tinta sobre Sol).
- **Rubros:** píldoras en superficie, 0.75rem.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** fondo.
- **Shadow Strategy:** sombra Tarjeta.
- **Border:** borde al 70 %.
- **Internal Padding:** 12px; 4px en riel y barra.

### Inputs / Fields
- **Style:** contorno en borde, fondo blanco, 6px de radio. Búsquedas con lupa a la izquierda.
- **Focus:** borde en acento y anillo de 2px del acento al 30 %.
- **Controles nativos:** casillas y deslizadores con `accent-color` en el acento y `color-scheme` según el tema.

### Navigation
- **Riel de paneles:** columna de botones de ícono (Capas, Mapa base, Agregar capas, Ayuda, Accesibilidad). El activo va en mar hondo; tocarlo de nuevo oculta el panel.

### Mosaico de tema (signature)
Cuadrado de 32px (20px en la ficha) con 8px de radio, relleno con la franja del tema. Lleva encima un ícono de Lucide (18px; 14px en la ficha) en tinta o blanco, mapeado por tema en `components/visor/ui.tsx`. Los íconos de la biblioteca provincial (`public/marca/temas/`) son de trazo fino y no se leen a este tamaño: quedan para piezas grandes. Encabeza cada grupo de capas y la línea de origen de la ficha.

### Ficha de consulta (signature)
Tarjeta de 320px:
- Arriba, un filete de 3px en la franja del tema. Debajo, el título y la línea de origen (mosaico chico más el nombre de la capa).
- Lista de campos con etiqueta tenue y valor.
- Paginación de resultados.
- El dato consultado se marca en el mapa con un aro de la franja del tema.
- Aparece desde el punto en 200ms con `cubic-bezier(0.16, 1, 0.3, 1)`. Es la única animación del visor.

## Do's and Don'ts

## Sitio público (inicio, catálogo, ayuda)

Las páginas del sitio siguen el sistema del Registro de Proveedores (proveedores.chubut.gob.ar), el sitio hermano del Ministerio, para que se lean como una misma familia:

- **Cabecera y pie:** petróleo `#16424f` con la firma del Ministerio en blanco (isotipo + Rubik) y un filete de 4px en degradé `#2e8ca8 → #ffc815 → #ff682c`. Iguales en los dos temas.
- **Portada = buscador ("¿Qué proveedor del Estado buscás?"):** sobre el degradé petróleo (`#16424f → #21708c → #2e8ca8`), un campo con sugerencias de rubros y localidades (fichas que se quitan) y, al instante, el total, el desglose por localidad o por rubro, algunos nombres y el acceso al visor ya filtrado. A la derecha, el Chubut en SVG con un círculo por localidad que cambia de tamaño con la búsqueda. Los datos vienen de `/api/buscar` (resumen calculado en el servidor desde el WFS). Es lo que diferencia al nodo de un portal de capas: responde una pregunta concreta.
- **Títulos de sección:** Public Sans 600 en petróleo.
- **Tarjetas:** blancas, borde `#e5e7eb`, 16px de radio. Íconos de la Biblioteca de Íconos de la Provincia (`public/marca/iconos/`, pintados con máscara CSS) en mar hondo sobre mar hondo al 10 %.
- **Acción principal:** naranja meseta honda con texto en tinta (5,4:1). Es la excepción a "The Acento Hace Trabajo Rule" y la heredan del Registro; el texto blanco sobre ese naranja (2,9:1) no se usa.
- **Sección alterna:** celeste `#f5fafb` a todo el ancho (la galería de capas).
- **Cifras:** las da el buscador (total sin filtros y por búsqueda); se calculan de los datos publicados, nunca se escriben a mano.
- **Interacción:** transiciones de propiedades concretas con `cubic-bezier(0.23, 1, 0.32, 1)`; los botones se hunden a 0.97 al presionar; las tarjetas con enlace suben 2px al pasar el mouse, solo con `@media (hover: hover) and (pointer: fine)`; con movimiento reducido no hay desplazamientos.
- **Galería:** una selección de capas que se ven sobre el Chubut; la que no responde se oculta, nunca queda un recuadro vacío.

### Do:
- **Do** asignar a cada tema nuevo una franja existente y un ícono de la biblioteca provincial en `TEMAS`.
- **Do** usar el acento mar hondo solo en acciones, selección y foco.
- **Do** poner la capa de origen debajo del título de la ficha, con el mosaico del tema.
- **Do** mantener una sola sombra (Tarjeta) para todo lo que flota sobre el mapa.
- **Do** escribir en voseo y con etiquetas en lenguaje claro ("Jurisdicción", no "jurisdiccion").

### Don't:
- **Don't** poner texto blanco sobre sol o meseta.
- **Don't** poner rótulos en mayúsculas encima de encabezados.
- **Don't** anidar tarjetas ni dar a las filas de capas borde y sombra propios.
- **Don't** usar Rubik fuera del logotipo.
- **Don't** agregar animaciones de entrada a paneles o filas: la ficha es el único momento animado.
