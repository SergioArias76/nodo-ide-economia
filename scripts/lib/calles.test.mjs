// Casos de comparación de calles tomados de la revisión del padrón (noviembre de 2026).
// Uso: node scripts/lib/calles.test.mjs
import { apellido, calleEquivalente, callesDe } from "./calles.mjs";

const casos = [
  // [domicilio del padrón, calle encontrada, ¿es la misma?]
  ["Juan D Peron", "JUAN DOMINGO PERON", true],
  ["Remedios de Escalada", "R DE ESCALADA DE SAN MARTIN", true],
  ["Hugo Mason", "HUGO MANSON", true],
  ["Roberto Payro", "Payro", true],
  ["Geronimo Malique", "Geronimo Maliqueo", true],
  ["Alte Brown", "Brown", true],
  ["Isabel de Capdeville", "Capdeville", true],
  ["Hipolito Irigoyen", "Avenida Hipólito Yrigoyen", true],
  ["H. Irigoyen", "Hipolito Yrigoyen", true],
  ["Pto Moreno", "PERITO MORENO", true],
  ["Julio A Roca", "J A ROCA", true],
  ["Colonos Galeces", "Colonos Galeses", true],
  ["Los Cipreces", "Los Cipreses", true],
  ["Ricardo Petinari", "Ricardo Luis Pettinari", true],
  ["Mazzaredo", "Avenida Mazaredo", true],
  ["Lasserre", "COMOD AUGUSTO LASERRE", true],
  ["Julio A Roca", "9 DE Julio", false],
  ["Jose Matos", "Jose M. Perez", false],
  ["Euclides More", "Perito Moreno", false],
  ["Luis Felman", "F. Luis Beltran", false],
  ["Psje Rio Negro", "Rio Mayo", false],
  ["J. DE LA PIEDRA", "Luis Piedrabuena", false],
  ["Posada Norte", "Pasaje Posadas", false],
  ["Chacho Peñaloza", "Pasaje Chaco", false],
  ["Reconquista", "R. DE Escalada", false],
  ["Maestro Fernandez", "Hernandez", false],
  ["Jose Maria Coronel", "Jose Maria Macias", false],
  ["Ingeniero Dias", "MODESTA DIAZ DE QUINTANA", false],
  ["Muster", "Musters", false],
];

let errores = 0;
for (const [pedida, encontrada, esperado] of casos) {
  const n = callesDe(pedida)[0];
  const r = calleEquivalente(n, encontrada) || (calleEquivalente(encontrada, n) && calleEquivalente(apellido(n), encontrada));
  if (r !== esperado) {
    errores++;
    console.log(`MAL  ${pedida} → ${encontrada}: dio ${r}`);
  }
}
console.log(`${casos.length - errores}/${casos.length} casos bien`);
process.exit(errores ? 1 : 0);
