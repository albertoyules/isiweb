# Diagnóstico: los vídeos de la rejilla no se reproducen solos en iPhone (Safari)

> ## RESUELTO — era "Reducir movimiento"
>
> **La causa: el iPhone tenía activado Ajustes → Accesibilidad → Movimiento →
> Reducir movimiento.** El código preguntaba por `prefers-reduced-motion` y,
> si estaba puesto, no reproducía NINGÚN vídeo (`js/app.js`, en la línea de
> `debe`, y `js/galeria.js`, un `return` al principio de `observar()`).
>
> Por qué costó dos horas encontrarlo: no daba ni un error. Los vídeos se
> descargaban ENTEROS y correctos, el póster se veía, tocar para abrir el
> reproductor funcionaba... simplemente nadie llegaba a dar la orden de
> reproducir. Y ninguna prueba lo cazó porque ni el Mac ni Playwright tenían
> esa opción puesta — hay que pedirla a propósito (`reducedMotion: "reduce"`).
>
> Lo que lo destapó fue el panel `?depurar`: `rs4 ns1 buf 6.0 mudo -> -`.
> Traducido: vídeo descargado del todo (6 s en el búfer), sin errores, mudo
> como debe ser, y `-> -` (motivo vacío) = **`reproducir()` no se ha llamado
> nunca**. Con eso el problema dejó de estar en iOS y pasó a estar en cuatro
> líneas nuestras.
>
> Medido con Playwright + WebKit móvil, forzando la opción:
>
> | | código anterior | corregido |
> |---|---|---|
> | Reducir movimiento ON | **0 vídeos moviéndose** | 3 moviéndose |
> | Reducir movimiento OFF | 2 moviéndose | 3 moviéndose |
>
> "Reducir movimiento" se sigue respetando para todo lo que es DECORACIÓN
> (paralaje, entrada de las piezas, suavizado del scroll, el nombre
> escribiéndose letra a letra). Lo que ya no hace es callar el contenido: en
> un portfolio de un videógrafo, los vídeos mudos en bucle son la obra, no un
> adorno.
>
> El resto del documento es la historia de cómo se llegó hasta aquí. Se deja
> entera porque los arreglos de las rondas 1-8 son reales y siguen puestos:
> resolvían atascos de ancho de banda y abortos de `play()` que también
> existían, pero que por sí solos no eran lo que dejaba la pantalla quieta.

Documento de traspaso. Escrito el 2026-08-19 tras varias rondas de arreglos que no
han resuelto el problema del todo. El dueño del proyecto (Alberto) va a probar con
otra IA/sesión y necesita contexto completo sin tener que repetir todo el proceso.

## El síntoma, tal cual lo describe el usuario

- Portátil/Mac: todo funciona bien.
- **iPhone 12, Safari**: los vídeos de la rejilla de la portada (scroll infinito) se
  quedan congelados en su imagen de póster. No se mueven solos nunca, esperes lo
  que esperes (probado 15-20s quieto, en wifi, sin resultado).
- **Tocar un vídeo SÍ funciona**: abre el reproductor a pantalla completa y se
  reproduce con sonido con normalidad. El problema es sólo el autoplay silencioso
  de la rejilla, no el vídeo/CDN en sí.
- Probado también con el Modo de bajo consumo desactivado (recarga limpia) — sigue
  igual, así que NO es el causante (se sospechó al principio y se descartó).

## Cómo se ha diagnosticado (importante: dejar de adivinar)

Las primeras rondas de arreglos se probaron con **Playwright + WebKit de
escritorio** emulando un iPhone (viewport, user agent, touch). Esto simuló bien la
maquetación pero **NO replica fielmente el comportamiento real de autoplay/vídeo
de iOS Safari** — varias veces algo que "funcionaba" en el simulador no funcionaba
en el iPhone real. Ojo con esto para cualquier verificación futura.

A partir de cierto punto se conectó el iPhone real al Mac por cable y se usó el
**Inspector Web de Safari** (Ajustes iPhone → Safari → Avanzado → Inspector web:
ON; luego Mac Safari → menú Desarrollo → [nombre del iPhone] → pestaña abierta).
Esto ha sido MUCHO más fiable — cada arreglo real que ha aportado algo salió de
mirar la consola/red reales del dispositivo, no de simular.

## Cronología de arreglos (de más antiguo a más reciente)

Cada punto es un commit real en el repo (`git log` para verlos todos). Los hashes
están puestos para que se pueda `git show <hash>` y ver el diff exacto.

1. **`eb6d5f9`** — Los pósters se pedían TODOS de golpe (23-46 peticiones) al
   cargar la página, sin esperar a que la pieza estuviera cerca de la pantalla.
   Se cambió para que se pidan igual que los vídeos, sólo cuando están cerca.
   Mejora real pero insuficiente por sí sola.

2. **`f514d50`** — El margen de "cerca" en móvil se había dejado demasiado corto
   (`anticipacionMovil: 0.6` pantallas) en el punto 1; algunas piezas quedaban
   fuera de ese margen en la posición inicial y no llegaban a pedirse NUNCA si el
   usuario no hacía scroll. Subido a 1.2. También se arregló que el botón
   flotante "Filtrar" tapaba literalmente el texto de los rótulos de dos líneas
   (añadido un degradado detrás, `.desvanecido-inferior`).

3. **`40a5285`** — Solape real (que el usuario SÍ pudo confirmar visualmente):
   las piezas aparecen con una animación de entrada (opacity + translateY 40px).
   La opacidad tardaba 0.25s y el desplazamiento 1.25s — durante ese segundo de
   diferencia una pieza podía estar YA OPACA pero sin llegar a su sitio,
   invadiendo la fila de al lado (el hueco entre filas en móvil es de sólo
   ~42px, casi lo mismo que el desplazamiento de 40px). Arreglado igualando las
   dos duraciones a 0.5s. Este SÍ quedó confirmado arreglado por el usuario.

4. **`3d26fbd`** — Comparado con otra web del mismo autor (cristiyules.com) que
   sí funciona bien en móvil. Se copiaron dos ideas:
   - Los pósters pasan a servirse desde el MISMO dominio que la página (Vercel),
     sin pasar por el CDN de Cloudflare R2 — la carpeta `posters/` SÍ está en
     git, así que no hace falta el CDN para ellos. Evita una conexión TLS nueva
     (DNS+handshake) sólo para la imagen que se ve primero.
   - Los vídeos "cerca pero no en pantalla" pasaron a pedirse con
     `preload="metadata"` en vez de `"auto"`, para no competir tanto por ancho
     de banda. **Esto resultó ser un error**, ver punto 5.

5. **`06aff7b`` — REVERTIDO el cambio de `preload="metadata"` del punto 4.
   Diagnosticado con el Inspector Web conectado al iPhone real: en la pestaña
   Red, TODOS los .mp4 se quedaban en **384-385 bytes**, etiquetados "0-1 del
   intervalo" — Safari en iOS pide sólo 1 byte de sonda para leer la cabecera
   del vídeo con `preload="metadata"` y NO CONTINÚA la descarga por su cuenta
   (a diferencia del motor de escritorio, que sí seguía). Vuelto a
   `preload="auto"` para todo. La idea de pósters same-origin SÍ se mantuvo (no
   tiene relación con este problema).

6. **`29ef9b9`** — Con `preload="auto"` ya puesto, se vio en el Inspector que
   varias peticiones de vídeo salían DUPLICADAS y en rojo (el mismo archivo
   pedido 2-3 veces, ninguna completándose). Causa: el "vigilante"
   (`setInterval` cada 1.5s que comprueba si `currentTime` avanza) confundía
   "todavía no ha arrancado a reproducirse" (currentTime sigue en 0 mientras se
   descarga el primer fotograma, normal que tarde en 4G) con "está clavado a
   mitad de reproducción", y reiniciaba la descarga desde cero en cuanto
   detectaba 3s sin cambio — tirando a la basura lo ya descargado, en bucle,
   sin dejar que ninguna descarga terminase nunca. Arreglado: sólo se considera
   "clavado" un vídeo que YA había llegado a `currentTime > 0` alguna vez y
   luego se congeló.

7. **`632bfd7`** — El hallazgo más gordo, diagnosticado tecleando DIRECTAMENTE
   en la consola del Inspector conectado al iPhone:
   ```js
   document.querySelector('.pieza video').play()
     .then(()=>console.log('OK'))
     .catch(e=>console.log('FALLO:', e.name, e.message))
   // → FALLO: AbortError - The operation was aborted.
   ```
   `AbortError` significa que se llamó a `.pause()` sobre un `.play()` que
   TODAVÍA no había terminado de resolverse. Y es justo lo que hacía nuestro
   código: la rejilla reevalúa qué vídeos deben reproducirse ~12 veces/segundo
   (cada 5 frames de un `requestAnimationFrame`), y en cuanto un vídeo dejaba
   de estar entre los "candidatos" más cercanos al centro se le mandaba
   `pause()` sin comprobar si su `play()` de hace un instante seguía en el
   aire. En el simulador de escritorio `play()` resuelve casi al instante, así
   que el hueco para un `pause()` de en medio era minúsculo (por eso nunca se
   vio en las pruebas simuladas). En el iPhone real, con `play()` tardando de
   verdad, el siguiente ciclo —83ms después— casi siempre alcanzaba a
   pausarlo antes de que arrancase.

   Arreglo: dos funciones compartidas en `js/rejilla.js`, `reproducir(video)` y
   `pausar(video)`, que llevan la cuenta de si hay un `play()` pendiente
   (`video.dataset.pendiente`) y, mientras lo esté, IGNORAN cualquier orden de
   pausar. Sustituyen a todas las llamadas directas a `.play()`/`.pause()` del
   bucle de la rejilla en `js/app.js` (portada) y `js/galeria.js` (categorías y
   fotos). El reproductor a pantalla completa (`abrirVisor`/`abrir`) no las usa
   porque no tiene reevaluación continua, no le hace falta.

   **Verificado con Playwright interceptando `HTMLMediaElement.prototype.play` y
   `.pause`, con un retraso artificial de 900ms en las respuestas de vídeo
   (simulando la latencia real que lo provocaba): 0 pause() de más, 0
   AbortError, vídeos reproduciéndose.** Pero esto sigue siendo el motor de
   escritorio, no un iPhone real — ver siguiente sección.

8. **Ronda actual** — se dejó de perseguir UNA causa concreta y se rehízo la
   capa de reproducción para que aguante aunque falle cualquiera de las
   piezas. Cinco cambios, todos en `js/rejilla.js` salvo donde se indique:

   - **Dos vías de arranque en vez de una.** `reproducir()` ya no depende
     sólo de su `play()`: pone `autoplay` y el silencio en el elemento
     ANTES de asignarle la fuente, así que el vídeo también puede arrancar
     por el camino propio del navegador (el que existe justo para vídeos
     mudos metidos en la página) sin pasar por ninguna promesa nuestra.
     Tienen que fallar las dos vías para que se quede quieto.
   - **El silencio, como atributo y no sólo como propiedad**
     (`defaultMuted` / `setAttribute("muted")`). `video.load()` devuelve la
     propiedad `muted` a su valor por defecto, que sin el atributo es
     "con sonido" — y en iOS un vídeo con sonido no tiene permiso para
     arrancar solo. Se llama a `load()` en varios sitios (al cargar y en el
     vigilante), así que este agujero estaba abierto de verdad.
   - **Se acabó el vaivén de plazas.** El reparto ya no va por distancia
     pelada al centro: `prioridad()` da ventaja fuerte a los vídeos que ya
     se están moviendo y a los que ya tienen datos. Antes la lista se
     reordenaba doce veces por segundo y el mismo vídeo recibía play() y
     pause() casi a la vez. Medido con Playwright + WebKit móvil y 900 ms
     de latencia artificial en los .mp4: **antes 86 play() / 78 pause() /
     8 AbortError durante el scroll; ahora 31 / 31 / 0.** Quieto sin tocar
     nada: 3 play(), 0 pause(), 0 AbortError.
   - **Se tapan las tres formas que quedaban de abortar un play() en
     vuelo**: margen de gracia de 1,2 s antes de poder pausar algo recién
     arrancado; `descargar()` no suelta la fuente de un vídeo con play()
     pendiente (quitar el `src` y llamar a `load()` es justo lo que produce
     el AbortError); y el vigilante tampoco lo recarga en ese estado.
     Además, `pendiente` ya no se puede quedar clavado en "1" para siempre
     si la promesa nunca contesta — hay un tope de 8 s.
   - **Red de seguridad al primer gesto** (`js/app.js` y `js/galeria.js`):
     en cuanto el usuario toca la pantalla por primera vez se vuelve a
     repartir las plazas, y esas llamadas a `play()` salen ya desde dentro
     del gesto, donde iOS las permite SIEMPRE. Si el autoplay silencioso
     estuviera bloqueado por una política o un ajuste del navegador —la
     única causa que no se puede descartar desde el código— esto lo
     arregla en cuanto se toca la pantalla.

   `CONFIG.scroll.autoplayMovil` sube de 2 a 3: con dos plazas y 4-6 piezas
   a la vista en la rejilla de 2 columnas, cualquier movimiento cambiaba de
   dueño las plazas constantemente.

## Panel de diagnóstico en el propio móvil (`?depurar`)

Ya NO hace falta el cable ni el Inspector Web para saber qué pasa. Se abre
desde el iPhone:

```
https://isidrogonzalez.vercel.app/?depurar
```

Sale un panel negro arriba con una fila por vídeo. Sin `?depurar` en la URL
el archivo `js/depurar.js` no hace absolutamente nada. Cómo leerlo:

| Lo que se ve | Qué significa |
|---|---|
| `MOVIÉNDOSE: 3` y la `t` subiendo | va bien; si aun así no se ve moverse nada, el problema es visual (CSS), no de reproducción |
| `-> NotAllowedError` | el navegador PROHÍBE el autoplay. No es la web: es una política o un ajuste del móvil. Al tocar la pantalla debería arrancar |
| `-> AbortError` | alguien sigue cortando el play() a medias — quedaría algún camino sin tapar |
| `rs0 ns2` para siempre | los datos no llegan: red o CDN |
| `rs0 ns1` | la descarga ni siquiera ha empezado |
| `err4` | ese archivo no se puede decodificar en ese móvil |
| `SUENA` en vez de `mudo` | el vídeo perdió el silencio; iOS no le dejará arrancar |

Esto convierte la siguiente prueba en el iPhone en algo de diez segundos, en
vez de otra ronda de suposiciones.

## Estado anterior (lo que había antes de la ronda 8)

El usuario probó DESPUÉS del commit `632bfd7` volviendo a teclear el mismo
comando manual en la consola:
```js
document.querySelector('.pieza video').play()...
```
y **sigue dando `AbortError`**, 3 veces seguidas.

**Esto no prueba necesariamente que el arreglo no sirva.** El comando manual del
usuario llama a `.play()` DIRECTAMENTE sobre el elemento, sin pasar por nuestra
función `reproducir()` — así que no marca `video.dataset.pendiente = "1"`. Si
justo en ese momento el bucle de fondo de la rejilla decide que ESE MISMO vídeo
ya no debe reproducirse y llama a `pausar(video)`, nuestra función SÍ va a
respetar la orden (porque no ve ningún `pendiente` marcado) y lo pausará,
abortando la llamada manual del usuario. Es decir: el test manual desde la
consola **ya no es una prueba fiable de si el arreglo funciona**, porque compite
con nuestro propio bucle de una forma que el arreglo no está diseñado para
cubrir (sólo protege las llamadas internas entre sí, no una llamada externa
arbitraria).

**Lo que de verdad hay que comprobar** (y no se ha llegado a hacer todavía):
1. Mirar la PANTALLA REAL del iPhone (no el Inspector) 15-20s sin tocar nada, en
   la portada, y ver si algún vídeo se mueve solo.
2. Si sigue sin moverse nada, repetir la prueba de red (Inspector → Red →
   filtrar `mp4`) y comprobar: ¿los tamaños ya no son 384 bytes? ¿ya no hay
   filas rojas/duplicadas?
3. Si los tamaños son correctos pero AÚN ASÍ nada se mueve en pantalla, el
   siguiente paso sería añadir instrumentación temporal (un `console.log`
   dentro de la propia función `reproducir()` de `js/rejilla.js`, ANTES del
   deploy) para ver en el Inspector si `reproducir()` se está llamando de
   verdad sobre los vídeos correctos, y si el propio `video.play()` interno
   (no el manual del usuario) sigue fallando con AbortError. Esto NO se ha
   probado todavía — sería el paso lógico siguiente si el problema persiste.

## Dónde está el código relevante

- `js/rejilla.js` — funciones compartidas: `medio()`, `cargar()`,
  `cargarPoster()`, `reproducir()`, `pausar()`, construcción de la rejilla.
- `js/app.js` — portada (scroll infinito en bucle). Bucle de render
  (`render()`, `actualizarMedios()`), vigilante (`vigilar()`), visor a pantalla
  completa (`abrirVisor`/`cerrarVisor`).
- `js/galeria.js` — páginas de categoría (`categoria.html`) y fotos
  (`fotos.html`), scroll normal (no infinito). Misma lógica de
  reproducir/pausar/vigilar duplicada aquí (no comparte función con app.js más
  allá de lo que está en rejilla.js).
- `js/config.js` — `CONFIG.scroll.*`: `anticipacion`, `anticipacionMovil`,
  `descargasALaVez`, `descargasALaVezMovil`, `autoplayMovil`,
  `autoplayEscritorio`.

## Despliegue

- Repo en GitHub, conectado a Vercel: cada `git push` a `main` despliega solo en
  **https://isidrogonzalez.vercel.app**. No hace falta `vercel --prod` manual.
- CDN de vídeo/preview: Cloudflare R2, `https://pub-c150fb9e2f294579ba8110a1709d028e.r2.dev`
  (variable `CONFIG.cdn` en `js/config.js`). Los pósters YA NO pasan por aquí
  (van same-origin, ver punto 4 de la cronología).
- Servidor local para pruebas: `node servidor.mjs` → `http://localhost:8777`
  (sirve los medios también desde R2 real, porque `CONFIG.cdn` apunta ahí
  siempre — no es un mock).

## Herramientas de prueba usadas

- Playwright instalado globalmente (`npm install -g playwright`, luego
  `playwright install webkit chromium`) — el motor **webkit** de Playwright es
  el que más se parece a Safari, pero sigue siendo un WebKit de escritorio, NO
  el motor real de iOS. Ha dado falsos positivos varias veces en este mismo
  hilo (ver puntos 4-7). Para cualquier duda sobre autoplay/vídeo en iOS, el
  Inspector Web conectado a un dispositivo real es muchísimo más fiable.
- Inspector Web de Safari (Mac) conectado por cable a un iPhone real: la
  herramienta que de verdad ha ido encontrando los problemas reales. Pasos:
  1. iPhone: Ajustes → Safari → Avanzado → Inspector web (ON).
  2. Conectar por cable, aceptar "Confiar en este ordenador".
  3. Mac: Safari → Ajustes → Avanzado → "Mostrar funciones para
     desarrolladores web" (ya estaba activado en este caso).
  4. Abrir la web en Safari del iPhone.
  5. Mac: menú Desarrollo → [nombre del iPhone] → pestaña abierta.

## Lo que YA se ha descartado como causa

- Modo de bajo consumo del iPhone (probado desactivado, recarga limpia, sigue
  igual).
- Caché de Safari (probado en incógnito/privado).
- Assets rotos o mal subidos al CDN (todos los .mp4/.jpg comprobados con
  `curl`, HTTP 200, tamaños correctos).
- Errores de JavaScript / excepciones no capturadas (consola limpia, sólo
  mensajes informativos de preconnect).
- Solape de piezas en la maquetación (comprobado con detección automática de
  colisiones — el único "solape" que detecta el script es un artefacto de
  animación fuera de pantalla, invisible en la práctica; el solape real que sí
  vio el usuario ya se arregló en el punto 3 de la cronología).
