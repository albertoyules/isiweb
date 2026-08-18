/* =========================================================
   Galería de scroll normal (páginas de categoría y de fotos)
   ---------------------------------------------------------
   A diferencia de la portada, aquí NO hay bucle: se baja hasta
   el final y se acaba. Los vídeos se cargan y se reproducen
   sólo cuando están en pantalla.

   El tipo de galería se indica en el <body>:
     data-galeria="videos"  → usa PROYECTOS, filtra por #hash
     data-galeria="fotos"   → usa FOTOS
   ========================================================= */

(function () {
  "use strict";

  const slug = (s) =>
    s.toString().toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const esMovil = () => window.matchMedia("(max-width: 600px)").matches;
  const reduceMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tipo = document.body.dataset.galeria || "videos";
  const contenedor = document.querySelector(".galeria");
  const tituloEl = document.querySelector("[data-titulo]");
  if (!contenedor) return;

  const fuente = tipo === "fotos"
    ? (typeof FOTOS !== "undefined" ? FOTOS : [])
    : (typeof PROYECTOS !== "undefined" ? PROYECTOS : []);

  const categorias = [...new Set(fuente.map((p) => p.categoria).filter(Boolean))];

  // ---------- Qué mostramos ----------
  const hash = (location.hash || "").replace(/^#/, "");
  const activa = categorias.find((c) => slug(c) === hash) || "";
  const items = activa ? fuente.filter((p) => p.categoria === activa) : fuente;

  // Título de la página
  const rotulo = activa || (tipo === "fotos" ? "Fotos" : "Trabajos");
  if (tituloEl) tituloEl.textContent = rotulo;
  document.title = `${rotulo} — ${CONFIG.nombre}`;

  // =========================================================
  // Pintado
  // =========================================================
  function crearPieza(p) {
    const art = document.createElement("article");
    art.className = "pieza";

    const marco = document.createElement("div");
    marco.className = "marco";
    marco.style.setProperty("--ar", arDeRejilla(p));

    if (tipo === "fotos") {
      const img = document.createElement("img");
      img.className = "media";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = medio(p.imagen);
      img.alt = p.titulo || "";
      marco.appendChild(img);
    } else {
      const v = document.createElement("video");
      v.className = "media";
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.preload = "none";
      v.disablePictureInPicture = true;
      if (p.poster) v.poster = medio(p.poster);
      v.dataset.src = medio(CONFIG.calidadRejilla === "completa" ? p.video : (p.preview || p.video));
      marco.appendChild(v);
    }
    art.appendChild(marco);

    const meta = document.createElement("div");
    meta.className = "meta type-small";
    meta.innerHTML = '<span class="titulo"></span><span class="cat"></span>';
    meta.querySelector(".titulo").textContent = p.titulo || "";
    meta.querySelector(".cat").textContent = p.categoria || "";
    art.appendChild(meta);

    art.addEventListener("click", () => abrir(p));
    return art;
  }

  function pintar() {
    contenedor.innerHTML = "";

    if (!items.length) {
      const vacio = document.createElement("p");
      vacio.className = "vacio type-large";
      vacio.textContent = tipo === "fotos"
        ? "Sección en preparación. Muy pronto habrá fotos aquí."
        : "Todavía no hay trabajos en esta categoría.";
      contenedor.appendChild(vacio);
      return;
    }

    // Sólo el vídeo se unifica; las fotos conservan su formato original.
    contenedor.appendChild(
      construirRejilla(tipo === "fotos" ? items : unificarVerticales(items), crearPieza)
    );
  }

  // =========================================================
  // Aparición y reproducción sólo de lo visible
  // =========================================================
  function observar() {
    const piezas = [...contenedor.querySelectorAll(".pieza")];

    const io = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("visible");
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    piezas.forEach((el) => io.observe(el));

    if (tipo === "fotos" || reduceMovimiento) return;

    const maxJugando = esMovil()
      ? CONFIG.scroll.autoplayMovil
      : CONFIG.scroll.autoplayEscritorio;

    const pagina = document.querySelector(".pagina") || window;
    let pendiente = false;

    let visorAbierto = false;
    window.addEventListener("visor", (e) => { visorAbierto = e.detail; revisar(); });

    function revisar() {
      pendiente = false;
      const vh = window.innerHeight;
      const candidatos = [];

      const porCargar = [];
      let cargando = 0;

      piezas.forEach((el) => {
        const v = el.querySelector("video");
        if (!v) return;
        const r = el.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - vh / 2);
        const enPantalla = r.top < vh && r.bottom > 0;
        const cerca = r.top < vh * (1 + CONFIG.scroll.anticipacion) &&
                      r.bottom > -vh * CONFIG.scroll.anticipacion;
        const lejos = r.top > vh * (1 + CONFIG.scroll.olvido) ||
                      r.bottom < -vh * CONFIG.scroll.olvido;

        if (v.networkState === 2) cargando++;   // NETWORK_LOADING

        if (cerca) {
          if (!v.src && v.dataset.src) {
            if (enPantalla) cargar(v);            // lo que se ve no espera turno
            else porCargar.push({ v, dist });
          }
          if (enPantalla) candidatos.push({ el, v, dist });
          else if (!v.paused) v.pause();
        } else {
          if (!v.paused) v.pause();
          if (lejos && v.src) { v.removeAttribute("src"); v.load(); el.dataset.debe = ""; }
        }
      });

      // De pocas en pocas y por cercanía, para no ahogar el ancho de banda
      porCargar.sort((a, b) => a.dist - b.dist);
      for (const { v } of porCargar) {
        if (cargando >= CONFIG.scroll.descargasALaVez) break;
        cargar(v);
        cargando++;
      }

      candidatos.sort((a, b) => a.dist - b.dist);
      candidatos.forEach((c, i) => {
        const debe = i < maxJugando && !visorAbierto;
        c.el.dataset.debe = debe ? "1" : "";
        if (debe) { if (c.v.paused) c.v.play().catch(() => {}); }
        else if (!c.v.paused) c.v.pause();
      });
    }

    /* Safari limita los decodificadores simultáneos y algún vídeo se queda
       clavado en el póster. Aquí se comprueba y se reintenta. */
    setInterval(() => {
      piezas.forEach((el) => {
        const v = el.querySelector("video");
        if (!v || el.dataset.debe !== "1" || !v.src) return;
        if (v.paused) { v.play().catch(() => {}); return; }
        if (v.currentTime === +el.dataset.t) {
          el.dataset.clavado = (+el.dataset.clavado || 0) + 1;
          if (+el.dataset.clavado >= 2) {
            const src = v.src;
            v.removeAttribute("src"); v.load();
            v.src = src; v.play().catch(() => {});
            el.dataset.clavado = 0;
          }
        } else {
          el.dataset.clavado = 0;
        }
        el.dataset.t = v.currentTime;
      });
    }, 1500);

    const alScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(revisar);
    };

    pagina.addEventListener("scroll", alScroll, { passive: true });
    window.addEventListener("resize", alScroll);
    revisar();
  }

  // =========================================================
  // Visor a pantalla completa
  // =========================================================
  const visor = document.querySelector(".visor");

  function abrir(p) {
    if (!visor) return;
    const video = visor.querySelector("video");
    const img = visor.querySelector("img");

    if (tipo === "fotos") {
      video.style.display = "none";
      img.style.display = "";
      img.src = medio(p.imagen);
    } else {
      img.style.display = "none";
      video.style.display = "";
      video.src = medio(p.video);
      vigilarCarga(visor, video);
      video.muted = false;            // aquí sí queremos oírlo
      video.volume = 1;
      video.play().catch(() => {});
    }
    // La rejilla se calla mientras el reproductor está abierto
    window.dispatchEvent(new CustomEvent("visor", { detail: true }));
    visor.querySelector(".pie").textContent =
      [p.titulo, p.categoria].filter(Boolean).join(" — ");
    visor.classList.add("abierto");
  }

  function cerrar() {
    if (!visor || !visor.classList.contains("abierto")) return;
    visor.classList.remove("abierto");
    window.dispatchEvent(new CustomEvent("visor", { detail: false }));
    const video = visor.querySelector("video");
    video.pause();
    setTimeout(() => { video.removeAttribute("src"); video.load(); }, 400);
  }

  if (visor) {
    visor.addEventListener("click", (e) => {
      if (e.target === visor || e.target.closest(".cerrar")) cerrar();
    });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  }

  // =========================================================
  // Barra de filtros
  // =========================================================
  const ui = document.querySelector(".ui-inferior");
  const barra = document.querySelector(".filtros");
  const btn = document.querySelector(".boton-filtro");

  if (barra) {
    const opciones = tipo === "fotos"
      ? [{ etiqueta: "Todas", url: "fotos.html", activo: !activa }]
          .concat(categorias.map((c) => ({
            etiqueta: c, url: "fotos.html#" + slug(c), activo: c === activa,
          })))
          .concat([{ etiqueta: "Vídeos", url: "index.html", activo: false }])
      : [{ etiqueta: "Todos", url: "index.html", activo: false }]
          .concat(categorias.map((c) => ({
            etiqueta: c, url: "categoria.html#" + slug(c), activo: c === activa,
          })))
          .concat([{ etiqueta: "Fotos", url: "fotos.html", activo: false }]);

    // Mismas dos salidas que en la portada: desde el móvil, el menú de abajo
    // es lo único que se tiene siempre a mano para cambiar de página.
    opciones.push(
      { etiqueta: "Sobre mí", url: "sobre-mi.html", aparte: true },
      { etiqueta: "Contacto", url: "contacto.html" }
    );

    opciones.forEach((o) => {
      const a = document.createElement("a");
      a.textContent = o.etiqueta;
      a.href = o.url;
      if (o.activo) a.className = "activo";
      if (o.aparte) a.classList.add("aparte");
      barra.appendChild(a);
    });
  }

  if (btn) btn.addEventListener("click", () => ui.classList.toggle("abierta"));
  document.addEventListener("click", (e) => {
    if (ui && ui.classList.contains("abierta") && !ui.contains(e.target)) {
      ui.classList.remove("abierta");
    }
  });

  // Cambiar de categoría con el hash sin recargar del todo
  window.addEventListener("hashchange", () => location.reload());

  // ---------- Arranque ----------
  pintar();
  observar();
})();
