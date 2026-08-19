/* =========================================================
   Formulario de contacto
   ---------------------------------------------------------
   Dos modos, según haya clave en CONFIG.contacto.formulario:

   CON CLAVE  → el mensaje se envía de verdad y llega al correo sin que el
                visitante salga de la página. Es lo que se quiere.
   SIN CLAVE  → se abre la aplicación de correo del visitante con el mensaje
                ya escrito. Funciona siempre, pero se pierden muchos: quien
                usa el correo desde el navegador no tiene app que abrir.

   Cómo conseguir la clave: está explicado paso a paso en js/config.js.
   ========================================================= */
(function () {
  "use strict";

  const form = document.querySelector(".formulario");
  if (!form) return;

  const c = CONFIG.contacto;
  const ajustes = c.formulario || {};
  const boton = form.querySelector('button[type="submit"]');
  const textoBoton = boton ? boton.textContent : "Enviar";

  /* Zona donde se le cuenta al visitante qué ha pasado. Se crea desde aquí
     para que el HTML no tenga que acordarse de ponerla. aria-live hace que
     un lector de pantalla lo anuncie sin tener que ir a buscarlo. */
  const aviso = document.createElement("p");
  aviso.className = "aviso-formulario type-small";
  aviso.setAttribute("role", "status");
  aviso.setAttribute("aria-live", "polite");
  form.appendChild(aviso);

  function decir(texto, tipo) {
    aviso.textContent = texto;
    aviso.dataset.tipo = tipo || "";
    /* En el móvil el aviso cae por debajo del botón, fuera de pantalla: se
       enviaba el mensaje y el visitante no veía ninguna confirmación, así
       que parecía que no había pasado nada. Se lo traemos a la vista. */
    if (texto) aviso.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function ocupado(si) {
    if (!boton) return;
    boton.disabled = si;
    boton.textContent = si ? "Enviando…" : textoBoton;
  }

  /* Cebo para robots: un campo que una persona nunca ve ni rellena, porque
     está escondido. Si viene con algo, es un programa rellenando el
     formulario a ciegas y se descarta sin más. Es lo que evita que la
     bandeja se llene de basura sin obligar a nadie a resolver un captcha. */
  const cebo = document.createElement("input");
  cebo.type = "checkbox";
  cebo.name = "botcheck";
  cebo.tabIndex = -1;
  cebo.setAttribute("autocomplete", "off");
  cebo.setAttribute("aria-hidden", "true");
  cebo.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";
  form.appendChild(cebo);

  // Plan B: componer un correo y dejar que lo mande su aplicación.
  function porCorreo(d) {
    const cuerpo =
      "Nombre: " + d.get("nombre") + "\n" +
      "Email: " + d.get("email") + "\n\n" +
      d.get("mensaje");
    location.href =
      "mailto:" + c.email +
      "?subject=" + encodeURIComponent("Consulta desde la web — " + d.get("nombre")) +
      "&body=" + encodeURIComponent(cuerpo);
    decir("Se ha abierto tu aplicación de correo con el mensaje escrito. " +
          "Si no se abre, escribe directamente a " + c.email + ".", "aviso");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (cebo.checked) return;                 // robot
    if (!form.reportValidity()) return;       // faltan campos

    const d = new FormData(form);

    if (!ajustes.clave) { porCorreo(d); return; }

    ocupado(true);
    decir("", "");

    try {
      const respuesta = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: ajustes.clave,
          subject: ajustes.asunto || "Nuevo mensaje desde la web",
          from_name: CONFIG.nombre,
          // "replyto" es lo que hace que al responder al correo le responda
          // al cliente y no a uno mismo.
          replyto: d.get("email"),
          nombre: d.get("nombre"),
          email: d.get("email"),
          mensaje: d.get("mensaje"),
        }),
      });
      const datos = await respuesta.json().catch(() => ({}));

      if (respuesta.ok && datos.success) {
        form.reset();
        decir("Mensaje enviado. Te responderá en 24–48 h.", "bien");
      } else {
        /* Si el servicio dice que no (clave caducada, cuota agotada), no se
           deja al visitante con un "error" a secas: se le abre el correo con
           lo que ya había escrito para que no pierda el texto. */
        porCorreo(d);
      }
    } catch (err) {
      // Sin conexión, o el servicio caído. Mismo plan B.
      porCorreo(d);
    } finally {
      ocupado(false);
    }
  });
})();
