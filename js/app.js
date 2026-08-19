/* =========================================================
   ISIDRO GONZÁLEZ — Scroll infinito en bucle
   ---------------------------------------------------------
   Cómo funciona:
   1. Se construye un "ciclo": rejilla de piezas + bloque del
      nombre en el centro + más piezas.
   2. Se mide su altura H y se clonan tantos ciclos como hagan
      falta para cubrir la pantalla (mínimo 2).
   3. El scroll es virtual: JS acumula el desplazamiento y lo
      suaviza; la posición se aplica con translate3d y módulo H,
      así el recorrido nunca termina (arriba y abajo).
   4. Sólo se cargan y reproducen los vídeos visibles; el resto
      se pausa y, si se alejan mucho, se descargan de memoria.
   ========================================================= */

(function () {
  "use strict";

  // ---------- Utilidades ----------
  const mod = (n, m) => ((n % m) + m) % m;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const slug = (s) =>
    s.toString().toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const esMovil = () => window.matchMedia("(max-width: 600px)").matches;
  const reduceMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Estado ----------
  const escena = document.querySelector(".escena");
  const pista = document.querySelector(".pista");
  if (!escena || !pista) return;

  let movido = 0;   // px arrastrados en el gesto actual

  const S = {
    actual: 0,        // desplazamiento suavizado
    objetivo: 0,      // desplazamiento real acumulado
    velocidad: 0,
    H: 0,             // altura de un ciclo
    clones: [],
    piezas: [],       // { el, video, oy, oh, cloneIndex }
    categoria: "",    // slug activo ("" = todas)
    vh: window.innerHeight,
  };

  // ---------- Datos ----------
  const listaCompleta = (typeof PROYECTOS !== "undefined" && PROYECTOS.length)
    ? PROYECTOS.slice()
    : demo();

  function demo() {
    // Marcadores de posición para poder ver el diseño sin vídeos aún.
    const cats = ["Bodas", "Publicidad", "Musical", "Corporativo"];
    return Array.from({ length: 9 }, (_, i) => ({
      titulo: "Añade tus vídeos a /videos",
      categoria: cats[i % cats.length],
      video: "",
      poster: "",
      ar: [ "4 / 5", "16 / 9", "3 / 4", "1 / 1" ][i % 4],
      demo: true,
    }));
  }

  const categorias = [...new Set(listaCompleta.map((p) => p.categoria).filter(Boolean))];

  // =========================================================
  // Construcción del DOM
  // =========================================================
  function crearPieza(p, idx) {
    const a = document.createElement("article");
    a.className = "pieza";
    a.dataset.idx = idx;

    const marco = document.createElement("div");
    marco.className = "marco";
    marco.style.setProperty("--ar", arDeRejilla(p));

    if (p.video) {
      const v = document.createElement("video");
      v.className = "media";
      // Silencio, bucle y reproducción dentro de la página: todo lo que iOS
      // exige para dejar que un vídeo arranque solo (ver prepararVideo).
      prepararVideo(v);
      /* El póster NO se asigna aquí. Antes se ponía de golpe al construir
         cada pieza, así que con 46 piezas en pantalla (rejilla + clones) la
         página arrancaba pidiendo 20-30 imágenes A LA VEZ, nada más cargar,
         compitiendo por ancho de banda con los vídeos que sí importa que
         lleguen pronto. En wifi no se nota, pero en un 4G real eso lo
         atasca todo y da la sensación de que nada carga. Se guarda en
         dataset y se pide sólo cuando la pieza está cerca de la pantalla
         (ver cargarPoster en actualizarMedios), igual que ya se hacía con
         el vídeo. */
      if (p.poster) v.dataset.poster = medio(p.poster, { sinCdn: true });
      // En la rejilla va la previa ligera; el archivo bueno se reserva
      // para el reproductor, que es donde se ve a pantalla completa.
      v.dataset.src = medio(CONFIG.calidadRejilla === "completa" ? p.video : (p.preview || p.video));
      marco.appendChild(v);
    }
    a.appendChild(marco);

    const meta = document.createElement("div");
    meta.className = "meta type-small";
    meta.innerHTML =
      '<span class="titulo"></span><span class="cat"></span>';
    meta.querySelector(".titulo").textContent = p.titulo || "";
    meta.querySelector(".cat").textContent = p.categoria || "";
    a.appendChild(meta);

    a.addEventListener("click", () => { if (movido > 8) return; abrirVisor(p); });
    return a;
  }

  function crearRejilla(items, baseIdx) {
    const cont = document.createElement("div");
    cont.appendChild(construirRejilla(items, crearPieza, baseIdx));
    return cont;
  }

  function crearBloqueNombre() {
    const cat = S.categoria
      ? categorias.find((c) => slug(c) === S.categoria)
      : null;

    const bloque = document.createElement("div");
    bloque.className = "bloque-nombre" + (cat ? " categoria" : "");

    // El <h1> real vive en el HTML (sr-only): aquí sólo pintamos,
    // porque el bloque se clona y no debe haber varios h1.
    const titulo = document.createElement("div");
    titulo.className = "type-xl";

    if (cat) {
      titulo.textContent = cat;
    } else {
      /* El nombre se anima letra a letra al entrar en pantalla (ver
         escribirTitulo). Cada letra es su propio span para poder animarla, y
         cada palabra va envuelta en .palabra para que en el móvil "ISIDRO" y
         "GONZÁLEZ" caigan en dos líneas enteras: a 15vw no cabían en una y
         el nombre se salía de la pantalla. */
      titulo.setAttribute("aria-hidden", "true");
      const palabras = CONFIG.nombre.split(" ").filter(Boolean);
      palabras.forEach((palabra, wi) => {
        const w = document.createElement("span");
        w.className = "palabra";
        [...palabra].forEach((letra) => {
          const sp = document.createElement("span");
          sp.className = "letra";
          sp.textContent = letra;
          w.appendChild(sp);
        });
        titulo.appendChild(w);
        if (wi < palabras.length - 1) {
          const hueco = document.createElement("span");
          hueco.className = "hueco-palabra";
          hueco.textContent = " ";
          titulo.appendChild(hueco);
        }
      });
    }
    bloque.appendChild(titulo);

    if (!cat) {
      const lema = document.createElement("p");
      lema.className = "lema type-large";
      lema.textContent = CONFIG.lema;
      bloque.appendChild(lema);
    }

    const acciones = document.createElement("div");
    acciones.className = "acciones";
    acciones.innerHTML =
      '<a class="pill" href="sobre-mi.html">Sobre mí</a>' +
      '<a class="pill pill--ghost" href="contacto.html">Contacto</a>';
    bloque.appendChild(acciones);

    return bloque;
  }

  function crearCiclo() {
    const items = S.categoria
      ? listaCompleta.filter((p) => slug(p.categoria) === S.categoria)
      : listaCompleta;

    // Con pocas piezas repetimos la lista para que el bucle respire.
    let lista = items.slice();
    if (lista.length === 0) lista = demo();
    while (lista.length < 9) lista = lista.concat(items.length ? items : demo());
    lista = unificarVerticales(lista);

    const ciclo = document.createElement("div");
    ciclo.className = "ciclo";

    // No siempre justo por la mitad: se busca el punto de corte que evite
    // dejar huecos grandes en la rejilla (ver elegirCorte en rejilla.js).
    const corte = elegirCorte(lista);
    ciclo.appendChild(crearRejilla(lista.slice(0, corte), 0));
    ciclo.appendChild(crearBloqueNombre());
    ciclo.appendChild(crearRejilla(lista.slice(corte), corte));
    return ciclo;
  }

  // =========================================================
  // Montaje y medición
  // =========================================================
  function montar() {
    pista.innerHTML = "";
    S.clones = [];
    S.piezas = [];

    const base = crearCiclo();
    pista.appendChild(base);

    // Medimos con un solo ciclo en el flujo
    base.style.position = "relative";
    S.H = Math.max(base.offsetHeight, 1);
    base.style.position = "";

    const nClones = Math.max(2, Math.ceil(S.vh / S.H) + 1);
    S.clones.push(base);
    for (let i = 1; i < nClones; i++) {
      const c = base.cloneNode(true);
      // Los clones repiten los listeners de click
      c.querySelectorAll(".pieza").forEach((el) => {
        el.addEventListener("click", () => {
          if (movido > 8) return;
          const idx = parseInt(el.dataset.idx, 10);
          const p = piezaPorIndice(idx);
          if (p) abrirVisor(p);
        });
      });
      pista.appendChild(c);
      S.clones.push(c);
    }

    // Índice de piezas con su posición dentro del ciclo
    S.clones.forEach((clon, ci) => {
      clon.querySelectorAll(".pieza").forEach((el) => {
        S.piezas.push({
          el,
          video: el.querySelector("video"),
          media: el.querySelector(".media"),
          oy: 0,
          oh: 0,
          ci,
        });
      });
    });

    // Bloques del nombre (uno por clon) para la animación de escritura.
    S.nombres = [];
    S.clones.forEach((clon, ci) => {
      clon.querySelectorAll(".bloque-nombre:not(.categoria) .type-xl").forEach((el) => {
        S.nombres.push({ el, letras: [...el.querySelectorAll(".letra")], ci, oy: 0, oh: 0, escrito: false });
      });
    });

    medir();
  }

  /* Mide el ciclo: altura total, posición de cada pieza y de cada bloque de
     nombre. Va aparte de montar() porque las separaciones de la rejilla van
     en vh: cuando cambia el alto de la ventana hay que volver a medir, pero
     NO hace falta reconstruir el DOM (y reconstruirlo se cargaba los vídeos
     que estuvieran descargándose). */
  function medir() {
    const base = S.clones[0];
    if (!base) return;

    base.style.position = "relative";
    S.H = Math.max(base.offsetHeight, 1);
    base.style.position = "";

    // offsetTop real: la pieza cuelga de .columna > .rejilla > .ciclo,
    // y .ciclo es el único ancestro posicionado, así que basta un salto.
    const desdeElCiclo = (el) => {
      let y = 0, n = el;
      while (n && !n.classList.contains("ciclo")) { y += n.offsetTop; n = n.offsetParent; }
      return y;
    };

    S.piezas.forEach((p) => { p.oy = desdeElCiclo(p.el); p.oh = p.el.offsetHeight; });
    S.nombres.forEach((n) => { n.oy = desdeElCiclo(n.el); n.oh = n.el.offsetHeight; });

    // Punto de partida: el bloque del nombre centrado en pantalla.
    const nombre = base.querySelector(".bloque-nombre");
    S.inicio = nombre
      ? mod(nombre.offsetTop + nombre.offsetHeight / 2 - S.vh / 2, S.H)
      : 0;
  }

  /* Anima el nombre letra a letra, como si se escribiera. Se dispara cada
     vez que el bloque entra en pantalla — al cargar y en cada vuelta del
     bucle, no sólo la primera. */
  function escribirTitulo(letras) {
    letras.forEach((sp, i) => {
      sp.animate(
        [
          { opacity: 0, transform: "translateY(0.35em) rotateX(-45deg)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 620, delay: i * 34, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
      );
    });
  }

  function actualizarNombres() {
    if (reduceMovimiento) return;
    const vh = S.vh;
    for (const n of S.nombres) {
      if (!n.letras.length) continue;
      const top = (S.clones[n.ci]._y || 0) + n.oy;
      const dentro = top < vh * 0.85 && top + n.oh > vh * 0.15;
      const lejos = top > vh * 1.4 || top + n.oh < -vh * 0.4;

      if (dentro && !n.escrito) {
        n.escrito = true;
        escribirTitulo(n.letras);
      } else if (lejos && n.escrito) {
        n.escrito = false;   // listo para volver a escribirse en la próxima vuelta
      }
    }
  }

  function piezaPorIndice(idx) {
    const items = S.categoria
      ? listaCompleta.filter((p) => slug(p.categoria) === S.categoria)
      : listaCompleta;
    const lista = items.length ? items : demo();
    return lista[idx % lista.length];
  }

  // =========================================================
  // Bucle de render
  // =========================================================
  let frame = 0;

  function render() {
    const suav = reduceMovimiento ? 1 : CONFIG.scroll.suavizado;
    const previo = S.actual;
    S.actual = lerp(S.actual, S.objetivo, suav);
    S.velocidad = S.actual - previo;

    const envuelto = mod(S.actual, S.H);

    for (let i = 0; i < S.clones.length; i++) {
      const y = i * S.H - envuelto;
      S.clones[i].style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      S.clones[i]._y = y;
    }

    // La gestión de vídeo no necesita ir a 60fps
    if (frame % 5 === 0) { actualizarMedios(); actualizarNombres(); }
    frame++;

    requestAnimationFrame(render);
  }

  function actualizarMedios() {
    const vh = S.vh;
    // Empezamos a descargar dos pantallas antes de que se vea, y no soltamos
    // el archivo hasta estar muy lejos: así al salir del hueco del nombre los
    // vídeos ya están listos y no hay ese parón de "se queda pillado".
    const movil = esMovil();
    const margenCarga = vh * (movil
      ? (CONFIG.scroll.anticipacionMovil ?? CONFIG.scroll.anticipacion)
      : CONFIG.scroll.anticipacion);
    const margenDescarga = vh * CONFIG.scroll.olvido;
    const maxJugando = movil
      ? CONFIG.scroll.autoplayMovil
      : CONFIG.scroll.autoplayEscritorio;
    const maxDescargas = movil
      ? (CONFIG.scroll.descargasALaVezMovil ?? CONFIG.scroll.descargasALaVez)
      : CONFIG.scroll.descargasALaVez;

    const candidatos = [];   // en pantalla: compiten por reproducirse
    const porCargar = [];    // cerca: compiten por descargarse
    let cargando = 0;

    for (const p of S.piezas) {
      const top = (S.clones[p.ci]._y || 0) + p.oy;
      const centro = top + p.oh / 2;
      const dist = Math.abs(centro - vh / 2);

      const enPantalla = top < vh && top + p.oh > 0;
      const cerca = top < vh + margenCarga && top + p.oh > -margenCarga;
      const lejos = top > vh + margenDescarga || top + p.oh < -margenDescarga;

      if (top < vh * 0.98 && top + p.oh > 0) p.el.classList.add("visible");

      if (p.media && !reduceMovimiento) {
        const prog = (centro - vh / 2) / vh;
        const off = clamp(prog, -1.4, 1.4) * (CONFIG.scroll.paralaje * 100) * -1;
        p.media.style.transform = `translate3d(0, ${off.toFixed(2)}%, 0)`;
      }

      if (!p.video) continue;

      // El póster sigue la misma regla de cercanía que el vídeo: así no
      // compite con él por ancho de banda cuando aún falta para verse.
      if (cerca) cargarPoster(p.video);

      // NETWORK_LOADING (2) = está bajando datos ahora mismo. Antes miraba
      // readyState, pero un vídeo pausado fuera de pantalla nunca llega a 3
      // y se quedaba ocupando el cupo para siempre, frenándolo todo.
      if (p.video.networkState === 2) cargando++;

      if (cerca) {
        if (!p.video.src && p.video.dataset.src) {
          if (enPantalla) cargar(p.video);        // lo que se ve no espera turno
          else porCargar.push({ p, dist });
        }
        if (enPantalla) candidatos.push({ p, dist });
        else pausar(p.video);
      } else {
        pausar(p.video);
        if (lejos) { descargar(p.video); p.debe = false; }
      }
    }

    // Descargamos por cercanía y de pocos en pocos: si lanzamos quince
    // peticiones a la vez se pelean por el ancho de banda y no llega ninguna.
    porCargar.sort((a, b) => a.dist - b.dist);
    for (const { p } of porCargar) {
      if (cargando >= maxDescargas) break;
      cargar(p.video);
      cargando++;
    }

    /* Reparto de las plazas de reproducción. NO por distancia pelada: ver
       prioridad() en rejilla.js — los que ya se mueven y los que ya tienen
       datos conservan la plaza, que es lo que evita el play/pause en bucle. */
    candidatos.sort((a, b) => prioridad(a.p.video, a.dist, vh) - prioridad(b.p.video, b.dist, vh));
    candidatos.forEach((c, i) => {
      const v = c.p.video;
      /* OJO con lo que NO pone aquí: antes esta línea llevaba también
         `&& !reduceMovimiento`, y era una de las dos formas que había de
         que no se reprodujera nada en el móvil sin ningún error por
         ninguna parte. Si el iPhone tiene "Reducir movimiento" activado
         (Ajustes → Accesibilidad → Movimiento), `debe` salía SIEMPRE
         falso: los vídeos se descargaban enteros, se veía su póster, al
         tocarlos se abrían y se reproducían bien... pero la rejilla no
         daba nunca la orden de arrancar. En un Mac sin esa opción puesta
         no se reproducía jamás, y por eso ninguna prueba lo cazó.

         "Reducir movimiento" pide que no haya animación DECORATIVA, y eso
         se sigue respetando al pie de la letra: nada de paralaje, ni de
         entrada de las piezas, ni de suavizado del scroll, ni del nombre
         escribiéndose letra a letra (ver el resto de usos de
         reduceMovimiento en este archivo). Pero los vídeos de la rejilla
         no son decoración: son el contenido de un portfolio de un
         videógrafo, mudos y en bucle. Silenciarlos del todo dejaba la web
         sin nada que enseñar. */
      const debe = i < maxJugando && !S.visorAbierto;
      c.p.debe = debe;
      if (debe) reproducir(v);
      else pausar(v);
    });

    if (typeof DEPURAR !== "undefined" && DEPURAR.activo) {
      DEPURAR.estado("en pantalla:" + candidatos.length + "  plazas:" + maxJugando +
                     "  visor:" + (S.visorAbierto ? "sí" : "no"));
    }
  }

  /* Desbloqueo al primer gesto — la red de seguridad definitiva.
     Dentro de un toque o un gesto del usuario, iOS permite play() SIEMPRE,
     sin excepciones ni políticas de por medio. Así que en cuanto el usuario
     toca la pantalla por primera vez volvemos a repartir las plazas, y esas
     llamadas a play() salen ya desde dentro del gesto. Si el autoplay
     silencioso estuviera bloqueado por lo que sea (un ajuste del propio
     Safari para este sitio, ahorro de datos, una política nueva de iOS),
     este es el único momento en que se puede arreglar — y basta con que
     ocurra una vez: a partir de ahí el elemento queda desbloqueado. */
  let desbloqueado = false;
  function desbloquear() {
    if (desbloqueado) return;
    desbloqueado = true;
    actualizarMedios();   // llama a reproducir() DENTRO del gesto
  }
  ["pointerdown", "touchstart", "keydown", "wheel"].forEach((ev) => {
    window.addEventListener(ev, desbloquear, { passive: true, capture: true });
  });

  /* Vigilante: Safari limita cuántos vídeos puede decodificar a la vez y
     alguno se queda clavado en el primer fotograma. Cada segundo y medio
     comprobamos que los que deberían moverse se están moviendo de verdad;
     si no, se reintenta y, en última instancia, se recarga la fuente. */
  function vigilar() {
    for (const p of S.piezas) {
      const v = p.video;
      if (!v || v.dataset.debe !== "1") continue;

      // Debería estar sonando pero ni siquiera tiene fuente: se le da una.
      // Pasa cuando el cupo de descargas simultáneas le dejó fuera y, al
      // no moverse nada después, nadie volvió a repartir.
      if (!v.src) { cargar(v); continue; }

      // Un play() todavía en el aire no se toca: recargarle la fuente ahora
      // lo abortaría, que es justo lo que había que dejar de hacer.
      if (v.dataset.pendiente === "1") continue;

      if (v.paused) { reproducir(v); continue; }

      if (v.currentTime > 0) p.arrancado = true;

      if (v.currentTime === p.ultimoT) {
        /* Antes de arrancar (todavía bajando el primer fotograma) esto no
           está "clavado", sólo tarda — sobre todo en una 4G floja, donde
           puede llevar varios segundos. Reiniciar la descarga en ese punto
           tira lo ya bajado a la basura y empieza de cero otra vez: visto
           con el Inspector Web en un iPhone real, esto es justo lo que
           pasaba — el mismo vídeo pedido 2-3 veces, ninguna llegando a
           completarse nunca. Sólo se reinicia si YA había arrancado a
           reproducirse y se ha quedado congelado a medias (el caso real
           que esto intenta arreglar: Safari decodificando demasiados
           vídeos a la vez y alguno se cuelga en marcha). */
        if (p.arrancado) {
          p.clavado = (p.clavado || 0) + 1;
          if (p.clavado >= 2) {
            const src = v.src;
            v.removeAttribute("src");
            v.load();
            v.src = src;
            // Se reinicia del todo: no hay play() en vuelo, y la respuesta
            // tardía del intento anterior queda invalidada (ver "ficha").
            v.dataset.pendiente = "";
            v.dataset.ficha = "";
            reproducir(v);
            p.clavado = 0;
            p.arrancado = false;
          }
        }
      } else {
        p.clavado = 0;
      }
      p.ultimoT = v.currentTime;
    }

    rescatar();
  }

  /* RESCATE — la última red, y la única que no se fía de nada nuestro.

     Todo el reparto de plazas se apoya en `oy`/`oh`, unas medidas que
     tomamos nosotros al montar la rejilla, y en un desplazamiento virtual
     que llevamos a mano. Si cualquiera de esas cuentas se descuadra (una
     remedida a destiempo, un cambio de altura de la barra de Safari en
     mitad del montaje…), la rejilla puede creer sinceramente que NINGUNA
     pieza está en pantalla, y entonces no manda reproducir nada. No hay
     error, no hay aviso: simplemente no pasa nada, que es exactamente lo
     que se veía en el móvil.

     Esto lo comprueba desde fuera: si no hay ni un vídeo moviéndose, se
     pregunta al navegador dónde están las piezas DE VERDAD
     (getBoundingClientRect, que no depende de ninguna cuenta nuestra) y se
     arranca a mano el que esté más centrado y ya tenga datos. */
  function rescatar() {
    if (S.visorAbierto) return;
    const alguno = S.piezas.some((p) => p.video && !p.video.paused && p.video.currentTime > 0);
    if (alguno) return;

    const vh = S.vh;
    const listos = [];
    for (const p of S.piezas) {
      const v = p.video;
      if (!v || v.readyState < 2) continue;        // sin datos no hay nada que hacer
      const r = p.el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) continue;  // no se ve
      listos.push({ v, dist: Math.abs(r.top + r.height / 2 - vh / 2) });
    }
    if (!listos.length) return;

    /* Si hemos llegado hasta aquí es que nuestras medidas no cuadran con lo
       que el navegador dice de verdad, así que se vuelven a tomar. Es
       barato y no toca el DOM (no destruye vídeos a medio descargar). */
    medir();

    const plazas = esMovil() ? CONFIG.scroll.autoplayMovil : CONFIG.scroll.autoplayEscritorio;
    listos.sort((a, b) => a.dist - b.dist);
    listos.slice(0, plazas).forEach(({ v }) => {
      // Marca de rescate: durante unos segundos, este vídeo manda sobre el
      // reparto normal (ver pausar() en rejilla.js). Si hemos tenido que
      // rescatarlo es justamente porque el reparto se está equivocando, y
      // sin esto volvería a pausarlo en la siguiente pasada.
      v.dataset.rescatado = String(Date.now());
      reproducir(v);
    });
    if (typeof DEPURAR !== "undefined") DEPURAR.rescates++;
  }
  setInterval(vigilar, 1500);

  // =========================================================
  // Entradas: rueda, táctil, teclado
  // =========================================================
  function normalizarRueda(e) {
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;        // líneas
    else if (e.deltaMode === 2) d *= S.vh; // páginas
    return d;
  }

  window.addEventListener("wheel", (e) => {
    if (document.querySelector(".visor.abierto")) return;
    e.preventDefault();
    S.objetivo += normalizarRueda(e) * CONFIG.scroll.velocidad;
    ocultarHint();
  }, { passive: false });

  // Arrastre (táctil y ratón)
  let arrastrando = false, ultY = 0, ultT = 0, vArrastre = 0;

  escena.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    arrastrando = true;
    movido = 0;
    ultY = e.clientY;
    ultT = performance.now();
    vArrastre = 0;
  });

  window.addEventListener("pointermove", (e) => {
    if (!arrastrando) return;
    const dy = e.clientY - ultY;
    const dt = Math.max(1, performance.now() - ultT);
    movido += Math.abs(dy);
    S.objetivo -= dy;
    vArrastre = (-dy / dt) * 16;
    ultY = e.clientY;
    ultT = performance.now();
    ocultarHint();
  }, { passive: true });

  window.addEventListener("pointerup", () => {
    if (!arrastrando) return;
    arrastrando = false;
    if (Math.abs(vArrastre) > 1) inercia(vArrastre);   // impulso
  });

  function inercia(v0) {
    let v = clamp(v0, -80, 80);
    (function paso() {
      if (Math.abs(v) < 0.4 || arrastrando) return;
      S.objetivo += v;
      v *= 0.94;
      requestAnimationFrame(paso);
    })();
  }

  window.addEventListener("keydown", (e) => {
    const paso = S.vh * 0.45;
    if (["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) {
      S.objetivo += paso; e.preventDefault(); ocultarHint();
    } else if (["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) {
      S.objetivo -= paso; e.preventDefault(); ocultarHint();
    } else if (e.key === "Escape") {
      cerrarVisor();
    }
  });

  // Deriva automática: desactivada por defecto (CONFIG.scroll.deriva = 0).
  // Si algún día la quieres, súbela a 0.2 y el bucle se moverá solo.
  const derivaBase = reduceMovimiento ? 0 : (CONFIG.scroll.deriva || 0);
  if (derivaBase > 0) {
    setInterval(() => { if (!arrastrando) S.objetivo += derivaBase; }, 16);
  }

  const hint = document.querySelector(".hint");
  let hintOculto = false;
  function ocultarHint() {
    if (hintOculto || !hint) return;
    hintOculto = true;
    hint.style.opacity = "0";
  }

  // =========================================================
  // Visor a pantalla completa
  // =========================================================
  const visor = document.querySelector(".visor");
  const visorVideo = visor ? visor.querySelector("video") : null;
  const visorPie = visor ? visor.querySelector(".pie") : null;

  function abrirVisor(p) {
    if (!visor || !p || !p.video) return;
    // Al abrir, la rejilla se calla y se para: el reproductor manda.
    S.visorAbierto = true;
    S.piezas.forEach((x) => pausar(x.video));

    visorVideo.src = medio(p.video);
    vigilarCarga(visor, visorVideo);
    visorVideo.muted = false;          // aquí sí queremos oírlo
    visorVideo.volume = 1;
    visorVideo.play().catch(() => {});
    visorPie.textContent = [p.titulo, p.categoria].filter(Boolean).join(" — ");
    visor.classList.add("abierto");
  }

  function cerrarVisor() {
    if (!visor || !visor.classList.contains("abierto")) return;
    visor.classList.remove("abierto");
    S.visorAbierto = false;
    visorVideo.pause();
    setTimeout(() => { visorVideo.removeAttribute("src"); visorVideo.load(); }, 400);
  }

  if (visor) {
    visor.addEventListener("click", (e) => {
      if (e.target === visor || e.target.closest(".cerrar")) cerrarVisor();
    });
  }

  // =========================================================
  // Filtros por categoría (rutas con #)
  // =========================================================
  const ui = document.querySelector(".ui-inferior");
  const barra = document.querySelector(".filtros");
  const btnFiltro = document.querySelector(".boton-filtro");
  const uiSuperior = document.querySelector(".ui-superior");

  function pintarFiltros() {
    if (!barra) return;
    barra.innerHTML = "";

    /* Desde la portada, cada categoría abre su propia página (scroll normal).
       Sobre mí y Contacto van también aquí: en el móvil sus botones sólo
       aparecían dentro del bloque del nombre, así que si no caías justo en
       él no había forma de salir de la portada. */
    const opciones = [{ etiqueta: "Todos", url: "", activo: true }]
      .concat(categorias.map((c) => ({ etiqueta: c, url: "categoria.html#" + slug(c) })))
      .concat([
        { etiqueta: "Fotos", url: "fotos.html" },
        { etiqueta: "Sobre mí", url: "sobre-mi.html", aparte: true },
        { etiqueta: "Contacto", url: "contacto.html" },
      ]);

    opciones.forEach((o) => {
      const el = document.createElement(o.url ? "a" : "button");
      el.textContent = o.etiqueta;
      if (o.url) el.href = o.url;
      if (o.activo) el.className = "activo";
      if (o.aparte) el.classList.add("aparte");
      if (!o.url) el.addEventListener("click", () => ui.classList.remove("abierta"));
      barra.appendChild(el);
    });
  }

  if (btnFiltro) {
    btnFiltro.addEventListener("click", () => ui.classList.toggle("abierta"));
  }
  document.addEventListener("click", (e) => {
    if (ui && ui.classList.contains("abierta") && !ui.contains(e.target)) {
      ui.classList.remove("abierta");
    }
  });

  function aplicarRuta() {
    const h = (location.hash || "").replace(/^#/, "");
    S.categoria = categorias.some((c) => slug(c) === h) ? h : "";
    montar();
    S.actual = S.objetivo = S.inicio;   // arrancamos con el nombre centrado
    pintarFiltros();
    if (uiSuperior) uiSuperior.style.display = S.categoria ? "" : "none";
    document.title = S.categoria
      ? `${categorias.find((c) => slug(c) === S.categoria)} — ${CONFIG.nombre}`
      : `${CONFIG.nombre} — ${CONFIG.lema}`;
  }

  window.addEventListener("hashchange", aplicarRuta);

  // =========================================================
  // Redimensionado
  // =========================================================
  let tRes;
  let anchoPrevio = window.innerWidth;

  window.addEventListener("resize", () => {
    S.vh = window.innerHeight;
    const ancho = window.innerWidth;
    const guardarSitio = (accion, espera) => {
      clearTimeout(tRes);
      tRes = setTimeout(() => {
        const rel = S.H ? mod(S.actual, S.H) / S.H : 0;
        accion();
        S.actual = S.objetivo = rel * S.H;   // conservamos la posición relativa
      }, espera);
    };

    /* ESTE ERA EL MOTIVO DE QUE EN EL MÓVIL NO CARGARA NINGÚN VÍDEO.
       En iOS, al deslizar, la barra del navegador se esconde y vuelve a
       salir: eso cambia window.innerHeight y dispara "resize" una y otra
       vez. Con el código anterior cada uno de esos avisos hacía un montar()
       entero, que vacía la pista y destruye todos los <video> — incluidos
       los que estaban a media descarga. Mientras se seguía deslizando, no
       les daba tiempo a cargar y se quedaban en el póster para siempre.
       Si sólo ha cambiado el alto, la maquetación es idéntica (depende del
       ancho): basta con volver a medir, sin tocar el DOM. */
    if (ancho === anchoPrevio) {
      guardarSitio(medir, 250);
      return;
    }

    anchoPrevio = ancho;
    guardarSitio(montar, 180);
  });

  // =========================================================
  // Arranque
  // =========================================================
  function arrancar() {
    S.vh = window.innerHeight;
    // Rellenamos los textos de marca en el HTML estático
    document.querySelectorAll("[data-nombre]").forEach((el) => (el.textContent = CONFIG.nombre));
    aplicarRuta();
    requestAnimationFrame(render);

    const cortina = document.querySelector(".cortina");
    if (cortina) {
      setTimeout(() => {
        cortina.classList.add("fuera");
        setTimeout(() => cortina.remove(), 700);
      }, 120);
    }
  }

  if (document.fonts && document.fonts.ready) {
    // Esperamos a las fuentes para medir bien la altura del ciclo
    document.fonts.ready.then(arrancar);
    setTimeout(() => { if (!S.H) arrancar(); }, 1500); // red de seguridad
  } else {
    window.addEventListener("load", arrancar);
  }
})();
