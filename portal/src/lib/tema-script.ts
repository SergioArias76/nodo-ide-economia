// Aplica el tema guardado (lib/tema.ts) antes de pintar, para que la página no parpadee. Sin elección
// guardada queda el claro, como los sitios del Gobierno del Chubut.
// Va aparte porque lo usa el layout raíz, que es un componente de servidor.
export const CLAVE_TEMA = "tema";
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CLAVE_TEMA}");if(t==="oscuro"||t==="sistema")document.documentElement.dataset.tema=t}catch(e){}`;
