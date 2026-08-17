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

  // Formulario sin backend: compone un correo con los datos.
  // Si prefieres recibirlo en tu bandeja sin abrir el cliente de correo,
  // cambia el <form> por uno de Formspree / Basin y quita este bloque.
  const form = document.querySelector(".formulario");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(form);
      const cuerpo =
        `Nombre: ${d.get("nombre")}\n` +
        `Email: ${d.get("email")}\n\n` +
        `${d.get("mensaje")}`;
      location.href =
        `mailto:${c.email}?subject=${encodeURIComponent("Consulta desde la web — " + d.get("nombre"))}` +
        `&body=${encodeURIComponent(cuerpo)}`;
    });
  }
})();
