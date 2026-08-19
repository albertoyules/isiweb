/* Rellena datos de contacto y el año en las páginas secundarias */
(function () {
  "use strict";
  const c = CONFIG.contacto;

  const set = (sel, texto, href) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (texto) el.textContent = texto;
      if (href && el.tagName === "A") el.href = href;
      if (!texto && !href) el.closest("li")?.remove();
    });
  };

  set("[data-email]", c.email, "mailto:" + c.email);
  set("[data-telefono]", c.telefono, "tel:" + (c.telefono || "").replace(/\s/g, ""));
  set("[data-ciudad]", c.ciudad);
  set("[data-instagram]", c.instagram ? "Instagram" : "", c.instagram);
  set("[data-vimeo]", c.vimeo ? "Vimeo" : "", c.vimeo);
  set("[data-youtube]", c.youtube ? "YouTube" : "", c.youtube);
  set("[data-nombre]", CONFIG.nombre);
  set("[data-anio]", new Date().getFullYear());

  // El formulario de contacto vive en js/formulario.js: envía de verdad al
  // correo cuando hay clave configurada, y si no, abre la aplicación de
  // correo del visitante como plan B.
})();
