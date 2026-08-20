/* =========================================================
   Configuración editable del sitio.
   Cambia aquí los textos, el contacto y el ritmo del scroll.
   ========================================================= */

const CONFIG = {
  nombre: "Isidro González",
  lema: "Videógrafo y fotógrafo.",

  contacto: {
    email: "Isiglez01@gmail.com",
    telefono: "+34 637 17 75 24",
    ciudad: "Málaga, España",
    instagram: "https://www.instagram.com/isiigonzalez_/",
    vimeo: "",
    youtube: "",

    /* FORMULARIO DE CONTACTO — para que los mensajes lleguen al correo.
       ---------------------------------------------------------------
       Mientras esto esté vacío, el formulario sigue funcionando pero
       abriendo la aplicación de correo del visitante con el mensaje ya
       escrito. Funciona, pero se pierden muchos: quien usa el correo desde
       el navegador no tiene ninguna app que abrir y se queda a medias.

       Para que el mensaje llegue solo, sin que el visitante tenga que hacer
       nada más que darle a Enviar (2 minutos, gratis, sin crear cuenta):

         1. Entra en  https://web3forms.com
         2. Escribe el correo donde quieres recibir los mensajes
            (el de Isidro: Isiglez01@gmail.com) y dale a "Create Access Key".
         3. A ESE correo le llega un email con una clave larga. Sólo tiene
            que abrirlo y copiarla — no hay que registrarse ni poner tarjeta.
         4. Pega la clave aquí abajo y publica (./actualizar.sh).

       Cada mensaje llega a su bandeja con el asunto "Nuevo mensaje desde la
       web", y respondiendo al correo le responde directamente al cliente. */
    formulario: {
      clave: "f6a0c3af-83c1-47f8-8777-ca77d85ce320",
      asunto: "Nuevo mensaje desde la web",
    },
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
       conexión — en wifi no se nota, pero en un 4G real eso lo atasca todo.
       OJO: no bajar esto de ~1.0. Con 0.6 se probó y algunas piezas del
       final de cada bloque quedaban justo fuera del margen en la posición
       inicial (antes de que el usuario toque nada) y, como la comprobación
       de qué está "cerca" sólo se repite cuando algo se mueve, se quedaban
       en blanco PARA SIEMPRE si nadie hacía scroll — no es que tardaran,
       es que no llegaban a pedirse nunca. Con 1.2 ya cubre sobradamente lo
       que se ve nada más abrir, sin volver a las 46 peticiones de golpe. */
    anticipacionMovil: 1.2,
    olvido: 6.0,        // pantallas de distancia a las que se suelta el archivo
    descargasALaVez: 6, // descargas simultáneas como mucho
    descargasALaVezMovil: 4,
    /* Nº máximo de vídeos reproduciéndose a la vez en móvil. Estaba en 2, y
       en una rejilla de 2 columnas se ven 4-6 piezas: con sólo dos plazas,
       cualquier movimiento del scroll hacía que las plazas cambiasen de
       dueño constantemente y ningún vídeo llegaba a arrancar. Con 3 hay
       margen suficiente para que el reparto se quede quieto, y sigue lejos
       del límite de decodificadores de iOS. */
    autoplayMovil: 3,
    autoplayEscritorio: 8,
  },
};
