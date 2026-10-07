// shpjs 6 no publica tipos: devuelve un FeatureCollection GeoJSON, o uno por capa si el .zip trae varias
declare module "shpjs" {
  type Coleccion = { type: "FeatureCollection"; features: object[]; fileName?: string };
  export default function shp(entrada: ArrayBuffer | string): Promise<Coleccion | Coleccion[]>;
}
