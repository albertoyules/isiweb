/* =========================================================
   Configuración editable del sitio.
   Cambia aquí los textos, el contacto y el ritmo del scroll.
   ========================================================= */

const CONFIG = {
  nombre: "Isidro González",
  lema: "Videógrafo y director de fotografía.",

  contacto: {
    email: "Isiglez01@gmail.com",
    telefono: "+34 637 17 75 24",
    ciudad: "Madrid, España",
    instagram: "https://www.instagram.com/isiigonzalez_/",
    vimeo: "",
    youtube: "",
  },

  /* Si algún día sirves los vídeos desde un CDN (Cloudflare R2, Bunny…),
     pon aquí la URL base y todo el sitio tirará de allí sin tocar nada más.
     Ejemplo: "https://media.isidrogonzalez.com"                              */
  cdn: "https://pub-c150fb9e2f294579ba8110a1709d028e.r2.dev",

  /* Calidad de los vídeos de la rejilla:
       "previa"   → bucles de 6 s y ~1 MB (recomendado, va suave)
       "completa" → el archivo bueno entero, máxima calidad pero mucho más
                    peso; en Safari puede volver a atascarse.               */
  calidadRejilla: "previa",

  // Ajustes del scroll infinito
  scroll: {
    suavizado: 0.085,   // 0.05 = muy suave / 0.2 = más directo
    velocidad: 1.0,     // multiplicador de la rueda del ratón
    paralaje: 0.04,     // desplazamiento interno del vídeo dentro del marco
    deriva: 0,          // 0 = sólo se mueve si lo mueves tú; 0.2 = va solo
    anticipacion: 2.0,  // pantallas de antelación con que se empieza a descargar
    /* En móvil ese mismo margen de "2 pantallas" cubre buena parte de la
       rejilla entera (las piezas son más altas que anchas y van apretadas),
       así que de entrada ya había 15-20 vídeos y pósters compitiendo por la
       conexión — en wifi no se nota, pero en un 4G real eso lo atasca todo
       y da la sensación de que nada carga solo. Con menos antelación en
       móvil, lo primero que se ve gana la conexión para él. */
    anticipacionMovil: 0.6,
    olvido: 6.0,        // pantallas de distancia a las que se suelta el archivo
    descargasALaVez: 6, // descargas simultáneas como mucho
    descargasALaVezMovil: 3,
    autoplayMovil: 2,   // nº máximo de vídeos reproduciéndose a la vez en móvil
    autoplayEscritorio: 8,
  },
};
