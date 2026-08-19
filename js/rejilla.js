/* =========================================================
   Construcción de la rejilla — compartida por la portada
   (bucle infinito) y por las páginas de scroll normal.
   ---------------------------------------------------------
   Las piezas verticales van en 3 columnas escalonadas.
   Las horizontales rompen la rejilla y ocupan dos tercios del
   ancho, alternando lado, para que no queden ridículas al lado
   de los vídeos en vertical.
   ========================================================= */

/* Ruta de un medio.
   - Si CONFIG.cdn está definido, se sirve desde allí.
   - Se le añade la versión que escribe el generador, para que al regenerar
     los vídeos el navegador no siga mostrando los de la caché. */
function medio(ruta, opciones) {
  if (!ruta) return "";
  if (/^https?:/i.test(ruta)) return ruta;
  /* Los pósters se quedan en el MISMO dominio que la página (Vercel), sin
     pasar por el CDN de Cloudflare. Se comprobó contra una web hermana
     (cristiyules.com) que sí carga bien en móvil: sus pósters van
     same-origin y sólo el vídeo pesado va al CDN. Tiene sentido — un
     dominio nuevo significa una conexión TLS nueva desde cero (DNS +
     handshake), y eso cuesta cientos de ms en una 4G floja, justo para la
     imagen que más importa: la que se ve primero, antes de que cargue
     nada más. Los pósters ya viajan con el propio despliegue (carpeta
     posters/ está en git), así que no hace falta el CDN para ellos. */
  const sinCdn = opciones && opciones.sinCdn;
  const base = sinCdn ? "" : (CONFIG.cdn || "").replace(/\/$/, "");
  const url = base ? base + "/" + ruta : ruta;
  const v = typeof MEDIA_V !== "undefined" ? MEDIA_V : "";
  return v ? url + (url.includes("?") ? "&" : "?") + "v=" + v : url;
}

/* Asigna la fuente y pide al navegador que la descargue del todo.
   Sin preload="auto" un vídeo pausado se queda a medias y, cuando entra en
   pantalla, hay que esperar a que termine: es lo que se notaba como tirón.

   OJO — esto se probó con preload="metadata" para lo que sólo estaba cerca
   (no en pantalla todavía), pensando que aliviaría el ancho de banda en
   móvil. En el simulador de escritorio parecía funcionar, pero comprobado
   con el Inspector Web conectado a un iPhone real: Safari en iOS con
   preload="metadata" pide un primer byte del vídeo (una sonda para leer
   duración/códec) Y SE QUEDA AHÍ, sin seguir bajando nada más por su
   cuenta — a diferencia del motor de escritorio, que sí continuaba. El
   vídeo se queda con ~1 byte descargado para siempre y nunca hay nada que
   reproducir. Por eso tocar un vídeo SÍ funcionaba (algo.play() fuerza la
   descarga completa de un tirón) pero el autoplay de la rejilla no.
   preload="auto" en TODO lo que se pide es lo único que se ha comprobado
   que funciona de verdad en un iPhone real; el resto de arreglos (pósters
   diferidos y same-origin, menos descargas simultáneas en móvil) ya
   recortan bastante el atasco sin tocar esto. */
function cargar(video) {
  if (!video || video.src || !video.dataset.src) return;
  video.preload = "auto";
  video.src = video.dataset.src;
  video.load();
  if (typeof DEPURAR !== "undefined") DEPURAR.apunta(video, "cargar");
}

/* Deja un <video> de rejilla con TODO lo que iOS exige para poder arrancar
   solo, sin sonido y dentro de la página (no a pantalla completa).

   Ojo con la diferencia entre PROPIEDAD y ATRIBUTO: `v.muted = true` pone la
   propiedad, pero el atributo `muted` del HTML es lo que define el valor por
   defecto, y `video.load()` (que llamamos al asignar la fuente, y también el
   vigilante al reintentar) devuelve la propiedad a ese valor por defecto. Sin
   el atributo, un load() podía dejar el vídeo con sonido durante un instante,
   y en iOS un vídeo con sonido NO tiene permiso para arrancar solo: play()
   se deniega y se queda en el póster. `defaultMuted = true` es justo la forma
   en JS de escribir ese atributo. */
function prepararVideo(v) {
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
  v.loop = true;
  v.setAttribute("loop", "");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.controls = false;
  v.disablePictureInPicture = true;
  v.preload = "none";

  /* Arranque en cuanto hay imagen. El vigilante que repasa los vídeos lo
     hace cada segundo y medio; esto reacciona en el instante exacto en que
     el vídeo pasa a tener datos suficientes, que es cuando el navegador
     está más dispuesto a dejarlo arrancar. `debe` lo marca la rejilla: es
     "este vídeo tiene ahora mismo una de las plazas de reproducción". */
  const alHaberDatos = () => { if (v.dataset.debe === "1") reproducir(v); };
  v.addEventListener("loadeddata", alHaberDatos);
  v.addEventListener("canplay", alHaberDatos);

  /* Si el vídeo se para solo (iOS lo hace cuando anda justo de memoria o de
     decodificadores) y debería seguir andando, se vuelve a poner en marcha
     sin esperar al vigilante. */
  v.addEventListener("pause", () => {
    if (v.dataset.debe !== "1") return;
    setTimeout(() => { if (v.dataset.debe === "1" && v.paused) reproducir(v); }, 300);
  });
}

/* Pide el póster sólo cuando hace falta (ver por qué en crearPieza, app.js
   y galeria.js). Ligero: sólo hay que asignarlo, sin tocar preload/load. */
function cargarPoster(video) {
  if (!video || video.poster || !video.dataset.poster) return;
  video.poster = video.dataset.poster;
}

/* EL FALLO GORDO EN MÓVIL ERA ESTE. La rejilla decide muchas veces por
   segundo qué vídeos deben reproducirse (según lo cerca que estén del
   centro de la pantalla), y antes se llamaba a video.play() / .pause()
   directamente cada vez. En un ordenador rápido play() resuelve casi al
   instante, así que nunca daba tiempo a que le llegara un pause() de en
   medio. En un iPhone real, con play() tardando de verdad (red, decodificar
   el primer fotograma…), el siguiente ciclo de la rejilla —83 ms después—
   ya le mandaba pause() al mismo vídeo ANTES de que play() llegara a
   resolverse. Eso aborta la reproducción con "AbortError: The operation
   was aborted" — confirmado tecleando directamente en la consola del
   Inspector Web conectado a un iPhone. El vídeo nunca llegaba a arrancar:
   se interrumpía a sí mismo en bucle, una y otra vez.

   Estas dos funciones llevan la cuenta de si hay un play() todavía en el
   aire (dataset.pendiente) y, mientras lo esté, ignoran cualquier orden de
   pausar — se deja que la promesa termine de resolverse antes de tocar el
   vídeo otra vez.

   Además de eso, `reproducir` no se fía sólo de su propia llamada a play():
   pone también `autoplay` en el elemento ANTES de asignarle la fuente. Así
   quien arranca el vídeo es el propio motor del navegador, por su camino de
   siempre (el que existe justo para vídeos sin sonido metidos en la página),
   sin depender de que una promesa nuestra llegue a buen puerto. Si nuestro
   play() se pierde por el camino, el motor lo arranca igual en cuanto tiene
   datos. Y al revés. Con las dos vías puestas, hace falta que fallen las dos
   para que el vídeo se quede quieto. */

const ESPERA_MAX_PLAY = 8000;   // ms: si play() no contesta, se da por perdido
const GRACIA_ARRANQUE = 1200;   // ms de margen antes de poder pausar algo recién arrancado
reproducir.contador = 0;        // numera los intentos de play() (ver "ficha")

/* `dataset.debe` guarda la INTENCIÓN ("este vídeo debería estar moviéndose
   ahora mismo"), y la escriben sólo reproducir() y pausar(). Así los avisos
   del propio navegador saben distinguir un vídeo que se ha parado solo —que
   hay que rearrancar— de uno que hemos parado nosotros a propósito.

   Escribir un atributo con el valor que ya tenía sigue costando trabajo al
   navegador, y esto se llama muchas veces por segundo sobre decenas de
   vídeos: sólo se toca cuando de verdad cambia. */
function marcarDebe(video, valor) {
  if (video.dataset.debe !== valor) video.dataset.debe = valor;
}

function reproducir(video) {
  if (!video) return;
  marcarDebe(video, "1");
  if (video.dataset.pendiente === "1") return;
  if (!video.paused && !video.ended) return;

  /* Antes de nada: fuente y permisos. El orden importa — `autoplay` y el
     silencio tienen que estar puestos ANTES del load() que hay dentro de
     cargar(), porque es en ese momento cuando el navegador decide si el
     vídeo puede arrancar solo. */
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  if (!video.src && video.dataset.src) cargar(video);
  if (!video.src) return;

  /* Cada intento lleva su número. Si mientras una promesa está en el aire el
     vigilante reinicia el vídeo y lanza un intento nuevo, la respuesta
     tardía del intento viejo no debe tocar el estado del nuevo — miraría un
     play() que ya no existe y lo daría por terminado antes de tiempo. */
  const ficha = String(++reproducir.contador);
  video.dataset.pendiente = "1";
  video.dataset.ficha = ficha;
  video.dataset.desde = String(Date.now());

  /* La promesa de play() puede quedarse colgada para siempre si los datos no
     llegan nunca (en una 4G floja pasa). Sin este reloj, `pendiente` se
     quedaría en "1" eternamente y el vídeo no volvería a aceptar NI un
     play() NI un pause(): muerto para el resto de la sesión. */
  let soltado = false;
  const soltar = (motivo) => {
    if (soltado) return;
    soltado = true;
    clearTimeout(reloj);
    video.dataset.motivo = motivo;
    if (typeof DEPURAR !== "undefined") DEPURAR.apunta(video, "play:" + motivo);
    if (video.dataset.ficha !== ficha) return;   // ya hay un intento más nuevo
    video.dataset.pendiente = "";
  };
  const reloj = setTimeout(() => soltar("sin-respuesta"), ESPERA_MAX_PLAY);

  const promesa = video.play();
  if (promesa && promesa.then) {
    promesa.then(() => soltar("ok")).catch((e) => soltar((e && e.name) || "error"));
  } else {
    soltar("ok");
  }
}

function pausar(video) {
  if (!video) return;
  marcarDebe(video, "");
  if (video.paused) return;
  if (video.dataset.pendiente === "1") return;
  /* Margen de gracia: nunca cortamos un vídeo que acaba de arrancar. Aunque
     play() ya haya resuelto, en iOS el primer fotograma tarda todavía un
     poco más en salir; si justo en ese hueco la rejilla reordena y le manda
     pausar, el usuario no llega a ver moverse nada nunca. */
  const desde = +video.dataset.desde || 0;
  if (desde && Date.now() - desde < GRACIA_ARRANQUE) return;
  /* Un vídeo arrancado por el rescate de app.js manda sobre el reparto
     normal durante unos segundos: si se ha llegado a rescatarlo es
     precisamente porque el reparto se estaba equivocando al decidir qué se
     ve y qué no, y dejarle pausarlo otra vez sería volver al principio. */
  const rescatado = +video.dataset.rescatado || 0;
  if (rescatado && Date.now() - rescatado < 4000) return;
  video.autoplay = false;   // que el motor no lo rearranque por su cuenta
  video.pause();
}

/* Suelta el archivo de un vídeo que ha quedado muy lejos, para no tener
   media docena de vídeos ocupando memoria a la vez.

   El detalle importante: quitar la fuente y llamar a load() ABORTA cualquier
   play() que estuviera todavía en el aire, y eso es exactamente el
   "AbortError" que dejaba los vídeos congelados en el póster. Da igual lo
   lejos que esté la pieza: si tiene un play() pendiente no se toca, y ya se
   descargará en la pasada siguiente (van doce por segundo, no se pierde
   nada por esperar una). */
function descargar(video) {
  if (!video || !video.src) return;
  if (video.dataset.pendiente === "1") return;
  marcarDebe(video, "");
  video.autoplay = false;
  video.removeAttribute("src");
  video.load();
  video.dataset.motivo = "descargado";
}

/* Puntuación con la que la rejilla decide QUIÉN de los vídeos que se ven se
   queda con una de las pocas plazas de reproducción simultánea.
   Menos es mejor. Parte de la distancia al centro de la pantalla, pero con
   dos ventajas grandes que le dan estabilidad al reparto:

   - Un vídeo que YA se está moviendo conserva su plaza mientras siga en
     pantalla. Sin esto, la lista se reordenaba doce veces por segundo y el
     mismo vídeo recibía play() y pause() casi a la vez, sin llegar a
     arrancar. Este vaivén era el origen del problema en el móvil.
   - Un vídeo que ya tiene datos descargados va por delante de uno que
     todavía está bajando. Antes, dos vídeos a medio descargar ocupaban las
     dos únicas plazas del móvil y dejaban fuera a otro que estaba listo
     para reproducirse ya. */
function prioridad(video, dist, vh) {
  let p = dist;
  if (video && !video.paused) p -= vh * 1.5;
  if (video && video.readyState >= 2) p -= vh * 0.5;
  return p;
}

/* Estados del reproductor: mientras carga muestra un giro, y si falla dice
   POR QUÉ falla en vez de quedarse en negro sin explicación. */
function vigilarCarga(visor, video) {
  if (!visor || !video) return;
  visor.classList.add("cargando");
  visor.classList.remove("fallo");

  const detalle = visor.querySelector(".estado.error .detalle");
  const listo = () => visor.classList.remove("cargando", "fallo");
  const fallo = (motivo) => {
    visor.classList.remove("cargando");
    visor.classList.add("fallo");
    if (detalle) {
      detalle.textContent = motivo + " · " +
        decodeURIComponent((video.currentSrc || video.src || "").split("/").slice(-2).join("/"));
    }
  };

  const tarde = setTimeout(() => {
    if (visor.classList.contains("cargando")) fallo("Tarda demasiado en llegar");
  }, 25000);

  const limpiar = () => {
    clearTimeout(tarde);
    video.removeEventListener("loadeddata", alCargar);
    video.removeEventListener("error", alFallar);
  };
  function alCargar() { limpiar(); listo(); }
  function alFallar() {
    limpiar();
    const c = video.error ? video.error.code : 0;
    fallo(["Error desconocido", "Reproducción cancelada", "Error de red",
           "El navegador no puede decodificarlo", "Formato no soportado"][c] || "Error " + c);
  }
  video.addEventListener("loadeddata", alCargar);
  video.addEventListener("error", alFallar);
}

// ¿La pieza es apaisada? Se decide con la proporción real ("16 / 9").
function esApaisada(p) {
  const [w, h] = (p.ar || "4 / 5").split("/").map((n) => parseFloat(n));
  return w && h ? w / h > 1.15 : false;
}

// Proporción con la que se PINTA la pieza (ver unificarVerticales).
function arDeRejilla(p) {
  return p.arRejilla || p.ar || "4 / 5";
}

// Altura relativa de una pieza si todas las columnas tuvieran ancho 1.
function alturaEstimada(p) {
  const [w, h] = arDeRejilla(p).split("/").map((n) => parseFloat(n));
  return w && h ? h / w : 1.25;
}

/* Pone a todas las piezas verticales la proporción más repetida del grupo.
   Casi todos los vídeos son 9/16; con que uno solo se salga (por ejemplo
   uno un poco más cuadrado), su columna cierra más arriba que las otras y
   queda un diente en el borde de abajo por mucho que el número de piezas
   cuadre. Al pintarlas todas con la misma proporción, las columnas acaban
   exactamente a la misma altura. Lo que sobra se recorta con object-fit:
   cover y en el reproductor el vídeo se sigue viendo entero.
   Sólo para vídeo: las fotos tienen formatos muy distintos a propósito. */
function unificarVerticales(items) {
  const cuenta = new Map();
  for (const p of items) {
    if (esApaisada(p)) continue;
    cuenta.set(p.ar, (cuenta.get(p.ar) || 0) + 1);
  }
  if (!cuenta.size) return items;
  const dominante = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return items.map((p) => (esApaisada(p) ? p : { ...p, arRejilla: dominante }));
}

/* Columnas según el ancho de pantalla.
   OJO: este número lo tiene que decidir JS, no el CSS. Antes el CSS forzaba
   2 columnas por debajo de 900px y 1 por debajo de 600px con !important,
   pero JS seguía repartiendo las piezas en 3 contenedores .columna: el
   tercero caía a una fila nueva y dejaba medio ancho de pantalla en blanco.
   De ahí venían los huecos grandes en tableta y móvil. */
function columnasBase() {
  const w = window.innerWidth;
  return w < 900 ? 2 : 3;
}

/* Cuántas columnas usar para un grupo de g piezas.
   Como casi todas las piezas son verticales y de la misma proporción, si g
   es múltiplo del número de columnas todas acaban EXACTAMENTE a la misma
   altura y no queda ni un hueco. Si no lo es, se prueba con una columna
   menos antes de rendirse: mejor un bloque de dos columnas bien cerrado que
   uno de tres con la última fila coja. */
function elegirColumnas(g) {
  const base = columnasBase();
  if (g <= 0) return base;
  if (g < base) return g;                       // 1 ó 2 piezas sueltas
  if (g % base === 0) return base;
  for (let c = base - 1; c >= 2; c--) if (g % c === 0) return c;
  return base;
}

// Piezas que sobran (las que dejarían una fila coja) con el mejor reparto.
function sobra(g) {
  const base = columnasBase();
  if (g <= 0 || g < base) return 0;
  let mejor = g % base;
  for (let c = base - 1; c >= 2 && mejor > 0; c--) mejor = Math.min(mejor, g % c);
  return mejor;
}

// Los mismos "grupos" (tandas entre piezas apaisadas) que formará
// construirRejilla al recorrer la lista, sin construir nada todavía.
function gruposDeFlush(sub) {
  const grupos = [];
  let actual = 0;
  for (const p of sub) {
    if (esApaisada(p)) { if (actual > 0) grupos.push(actual); actual = 0; }
    else actual++;
  }
  if (actual > 0) grupos.push(actual);
  return grupos;
}

/* Punto de corte del ciclo que separa la mitad de arriba y la de abajo del
   nombre. Cada grupo de piezas normales entre apaisadas se reparte en
   columnas; si su tamaño no cuadra con el número de columnas, la última
   fila queda coja y ahí aparece el hueco. El corte en sí también abre un
   grupo nuevo (separa lo de arriba de lo de abajo), así que hay que mirar
   los grupos que resultarían de verdad — no basta con contar piezas por
   mitad — y quedarse con el corte que deje menos piezas sueltas. */
function elegirCorte(lista) {
  const centro = Math.ceil(lista.length / 2);
  const puntuacion = (grupos) => grupos.reduce((n, g) => n + sobra(g), 0);

  let mejor = centro;
  let mejorMalo = Infinity;
  const candidatos = [centro];
  for (let d = 1; d <= Math.ceil(lista.length / 2); d++) candidatos.push(centro - d, centro + d);

  for (const c of candidatos) {
    if (c < 1 || c > lista.length - 1) continue;
    const malo =
      puntuacion(gruposDeFlush(lista.slice(0, c))) +
      puntuacion(gruposDeFlush(lista.slice(c)));
    // A igualdad de huecos, el corte más cercano al centro reparte mejor
    // el ciclo entre lo que se ve antes y después del nombre.
    if (malo < mejorMalo || (malo === mejorMalo && Math.abs(c - centro) < Math.abs(mejor - centro))) {
      mejorMalo = malo;
      mejor = c;
    }
  }
  return mejor;
}

/**
 * Devuelve un fragmento con la maquetación completa de la lista.
 * @param {Array}    items      piezas a colocar
 * @param {Function} crearPieza (item, indiceGlobal) => elemento
 * @param {Number}   base       desplazamiento del índice global
 */
function construirRejilla(items, crearPieza, base = 0) {
  const frag = document.createDocumentFragment();
  /* Las columnas ya no van escalonadas. El escalonado (0 / 11 / 4 vh) daba
     un aire editorial, pero como todas las piezas son verticales y de la
     misma proporción, era justo lo que impedía que el bloque cerrase a ras:
     dejaba un diente arriba y otro abajo en cada rejilla. Sin desfase y con
     un número de piezas múltiplo de las columnas, el bloque queda macizo. */
  const desfasesVh = [0, 0, 0];
  const GAP = 0.5;               // separación entre piezas, misma escala que h/w
  let cola = [];
  let ladoAncha = 0;

  function volcarColumnas() {
    if (!cola.length) return;
    const n = elegirColumnas(cola.length);

    const rejilla = document.createElement("div");
    rejilla.className = "rejilla";
    rejilla.style.setProperty("--cols", n);
    // Cuántas columnas tendría el bloque si el número de piezas cuadrase:
    // el CSS lo usa para estrechar el bloque en vez de estirar las piezas
    // (si no, un bloque de 2 columnas sale con los vídeos gigantes al lado
    // de los de 3).
    rejilla.style.setProperty("--cols-base", columnasBase());

    const columnas = [];
    const alturas = [];
    for (let c = 0; c < n; c++) {
      const col = document.createElement("div");
      col.className = "columna";
      col.style.marginTop = (desfasesVh[c] ?? 0) + "vh";
      rejilla.appendChild(col);
      columnas.push(col);
      alturas.push((desfasesVh[c] ?? 0) / 55);
    }

    /* A la columna más corta hasta el momento: con alturas reales (no sólo
       el índice) ninguna se queda muy por detrás de las demás.
       El tope por columna es lo que cierra el bloque: sin él, una pieza algo
       más baja que las demás podía llevarse dos huecos a la misma columna y
       dejar otra corta aunque el número de piezas cuadrase. */
    const maxPorColumna = Math.ceil(cola.length / n);
    const cuentas = new Array(n).fill(0);

    cola.forEach(({ p, i }) => {
      let destino = -1;
      for (let c = 0; c < n; c++) {
        if (cuentas[c] >= maxPorColumna) continue;
        if (destino === -1 || alturas[c] < alturas[destino]) destino = c;
      }
      if (destino === -1) destino = 0;
      columnas[destino].appendChild(crearPieza(p, base + i));
      alturas[destino] += alturaEstimada(p) + GAP;
      cuentas[destino]++;
    });

    frag.appendChild(rejilla);
    cola = [];
  }

  items.forEach((p, i) => {
    if (esApaisada(p)) {
      volcarColumnas();                       // cerramos el bloque en curso
      const fila = document.createElement("div");
      fila.className = "fila-ancha " + (ladoAncha++ % 2 ? "der" : "izq");
      fila.appendChild(crearPieza(p, base + i));
      frag.appendChild(fila);
    } else {
      cola.push({ p, i });
    }
  });

  volcarColumnas();
  return frag;
}
