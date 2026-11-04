// Comparación de nombres de calles del padrón con los de Georef, OpenStreetMap y otros registros.
// La usan scripts/geocodificar-domicilios.mjs y scripts/importar-api-proveedores.mjs.

export const sinAcentos = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// ¿La calle que devolvió el servicio es la que se pidió? (descarta "Los Notros" → "Los Peñascos")
export const TITULOS = /\b(av|avda|avenida|calle|bv|bvar|boulevard|bulevar|pje|psje|pasaje|gral|general|dr|doctor|cqe|cque|cacique|tte|teniente|cnel|coronel|pte|presidente|ing|ingeniero|almte|alte|almirante|grl|sgto|sargento|cjal|concejal|tnte|prof|profesor|mons|monsenor|cap|capitan|cte|comandante|pbro|presbitero|arq|pto|perito|de|del|la|las|los|el)\b/g;

// Comparación tolerante: "JUAN D. PERON" ≈ "JUAN DOMINGO PERON", "HUGO MASON" ≈ "HUGO MANSON",
// "REMEDIOS DE ESCALADA" ≈ "R DE ESCALADA DE SAN MARTIN". Exige que todas las palabras pedidas aparezcan.
export function casiIgual(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  // distancia de edición ≤ 1
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}
// Sin títulos ("GRAL", "DR", "CNEL"…), salvo que sea la última palabra: "JOSE MARIA CORONEL" es un apellido
export const ES_TITULO = new RegExp(`^${TITULOS.source}$`);
export const palabras = (s) => {
  const t = sinAcentos(s ?? "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return t.filter((p, i) => !ES_TITULO.test(p) || (i === t.length - 1 && !["de", "del", "la", "las", "los", "el"].includes(p)));
};
// Clave fonética del castellano: v/b, z/s, c(e,i)/s, y/i, ll/y, h muda y letras dobles
export const alOido = (t) => t.replace(/ll/g, "y").replace(/^h/, "").replace(/v/g, "b").replace(/z/g, "s").replace(/c(?=[ei])/g, "s").replace(/y/g, "i").replace(/(.)\1/g, "$1");
export function calleEquivalente(pedida, encontrada) {
  // los números cuentan siempre: "9 DE JULIO" no es "JULIO A ROCA"
  const a = palabras(pedida).filter((t) => t.length >= 2 || /^\d+$/.test(t)), b = palabras(encontrada);
  // Todas las palabras pedidas tienen que aparecer, y al menos una tal cual (o abreviada): las iniciales
  // ("R DE ESCALADA" por "REMEDIOS") y los errores de una letra ("MASON") solo completan, nunca deciden solas.
  // Así "CHACHO PEÑALOZA" no es "PASAJE CHACO" ni "RECONQUISTA" es "R. DE ESCALADA".
  // igual, o igual al oído: "GALECES" = "GALESES", "IRIGOYEN" = "YRIGOYEN", "PETINARI" = "PETTINARI" (pero "FERNANDEZ" ≠ "HERNANDEZ")
  const fuerte = (t, u) => t.length >= 3 && (t === u || (t.length >= 4 && u.length >= 4 && alOido(t) === alOido(u)));
  // casi igual o abreviada ("MUSTER" ≈ "MUSTERS", "GOB" ≈ "GOBERNADOR"); con inicial solo un nombre de pila, no el apellido
  const ultima = a.filter((t) => t.length >= 3).at(-1);
  const debil = (t, u) => casiIgual(t, u) || (t !== ultima && ((u.length === 1 && t[0] === u) || (t.length === 1 && u[0] === t)));
  // con una sola palabra pedida, tiene que ser el apellido de la encontrada: "DIAS" no es "MODESTA DIAZ DE QUINTANA"
  const largasA = a.filter((t) => t.length >= 3), largasB = b.filter((t) => t.length >= 4);
  if (largasA.length === 1 && largasB.length >= 2 && !fuerte(largasA[0], largasB.at(-1)) && !debil(largasA[0], largasB.at(-1))) return false;
  return a.some((t) => b.some((u) => fuerte(t, u))) && a.every((t) => b.some((u) => fuerte(t, u) || debil(t, u)));
}
// El nombre de la calle sin lo que viene detrás: altura, teléfono, barrio, manzana… Una esquina
// ("HUDSON Y BUCETICH", "BROWN ESQ. CONDOR") da las dos calles. Los números que son parte del nombre
// se quedan: "9 DE JULIO", "25 DE MAYO", "CODIGO 2434", "RUTA 3".
export function callesDe(texto) {
  return texto
    .split(/\s+(?:y|e|esq\.?|esquina)\s+/i)
    .map((parte) => parte
      .replace(/\s*(?:\s-\s|\bB[º°ª]|\bbarrio\b|\bmz\b|\bm:|\bt\.?e\.?\b|\btel\b|\bcasa\b|\bmblok\b|\bmonoblock\b|\bescalera\b|\bsector\b|\bnro\b).*$/i, "")
      .replace(/(?<!\b(?:codigo|calle|ruta|pasaje|pje|avenida|av)\.?)\s+\d+(?!\s+de\b).*$/i, "")
      .replace(PREFIJO_VIA, "")
      .trim())
    .filter((parte) => /[a-z]{3}/i.test(parte));
}
export const apellido = (calle) => palabras(calle).filter((t) => t.length >= 3).at(-1) ?? "";
// La palabra más distintiva de la calle, para buscarla en Georef
// (si tiene números, como "CODIGO 2434" de Comodoro, el nombre entero)
export const palabraClave = (calle) => (/\d/.test(calle) ? palabras(calle).join(" ") : palabras(calle).filter((t) => t.length >= 3).sort((x, y) => y.length - x.length)[0]);

export const PREFIJO_VIA = /^(?:(?:av|avda|avenida|bv|bvar|bvard|boulevard|bulevar|calle|pje|psje|pasaje)\b\.?|b\.)\s*/i;

export const distanciaKm = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
