# Portfolio — Isidro González

Sin frameworks, sin build: HTML + CSS + JavaScript. Se sube tal cual a cualquier hosting.

**Cómo está organizado:**

| Página | Qué hace |
|---|---|
| `index.html` | Portada. Todos los vídeos en **bucle infinito**, con el nombre en el centro. |
| `categoria.html#deportes` | Una categoría concreta, con **scroll normal** de arriba abajo. |
| `fotos.html` | Sección de fotos, también con scroll normal. |
| `sobre-mi.html` · `contacto.html` | Páginas de texto. |

El botón **Filtrar** de abajo lleva de una a otra en todas las páginas.

---

## 0. Añadir vídeos o fotos — un solo comando

Para el día a día sólo hace falta esto:

1. Metes los archivos nuevos en `videos/CATEGORIA/` (o `fotos/CATEGORIA/`).
2. En la terminal, dentro de esta carpeta:

```bash
./actualizar.sh
```

Y ya está. El script comprime lo nuevo, saca las miniaturas, regenera
`js/datos.js`, sube a Cloudflare **sólo lo que falta**, publica, y espera a
comprobar que la web ya está sirviendo el contenido nuevo antes de darte el OK.
Si algo falla, te dice qué y en qué paso.

```bash
./actualizar.sh --probar          # hace todo menos publicar y lo abre en local
./actualizar.sh -m "Boda de Ana"  # mensaje propio en el historial
```

**Cuánto tarda.** Lo que manda es el tamaño del original: un clip 4K de cámara
son ~900 MB y comprimirlo lleva de medio minuto a un minuto. Cuatro o cinco
vídeos nuevos son unos 3–4 minutos, sin tener que estar delante. Todo lo demás
(subida, publicación) son segundos. Lo ya procesado **no se vuelve a tocar**:
añadir un vídeo a una carpeta de veinte sólo trabaja con ese.

> Los pasos sueltos (`node generar-datos.mjs`, `./subir-r2.sh`) siguen
> existiendo y están explicados más abajo, por si algún día hace falta
> ejecutar sólo uno.

---

## 1. Poner tus vídeos

Mete los archivos en `videos/`, **en una carpeta por categoría**. El nombre de la
carpeta es el que sale luego en el botón de filtros:

```
videos/
  DEPORTES/
    Embassy.mp4
  PUBLICIDAD/
    Benajarafe.mp4
  NEGOCIOS/
    Pelu definitivo.mp4
```

Si escribes la carpeta en mayúsculas, en la web se muestra como «Deportes».
Y **el rótulo de cada vídeo sale del nombre del archivo**: `Pelu definitivo.mp4`
→ «Pelu definitivo». Si quieres otro título, renombra el archivo y vuelve a
lanzar el generador. Un `IMG_8512.MOV` se verá como «IMG 8512», así que
conviene ponerles nombre a los archivos antes.

Y después, en la terminal, dentro de esta carpeta:

```bash
node generar-datos.mjs
```

Eso lee los vídeos, saca una miniatura (poster) de cada uno, calcula sus
proporciones reales y escribe `js/datos.js`. **Cada vez que añadas o quites
vídeos, vuelve a ejecutarlo.**

> Una vez existe la copia ligera de un vídeo en `videos-web/`, el generador la
> reutiliza aunque no pases `--optimizar`: no vuelve a comprimir lo ya hecho.

### Las dos versiones de cada vídeo

El generador crea **dos archivos** por cada vídeo, y esto es lo que hace que la
web vaya fina:

| Archivo | Dónde se usa | Tamaño |
|---|---|---|
| `previews/…mp4` | En la rejilla. 6 s, 640 px, sin audio. | ~200 KB |
| `videos-web/…mp4` | Al hacer clic, a pantalla completa y con sonido. | 2–10 MB |

Es importante: el navegador (sobre todo Safari) sólo aguanta unos pocos vídeos
decodificándose a la vez. Con los archivos completos se atraganta y deja algunos
congelados en el póster; con las previas puede con ocho sin despeinarse. La
portada entera pesa ahora **1,2 MB** al abrirse.

### Que no pese demasiado

```bash
node generar-datos.mjs --optimizar
```

Crea `videos-web/` con copias a 1280 px, sin audio y con `faststart`
(un clip de 10 s baja a ~1–2 MB). La web usa esas copias y deja los originales
intactos. **Recomendado**: los vídeos de cámara pesan demasiado para la web.

Consejos:
- Clips de **6–12 segundos**, son bucles mudos de escaparate.
- El vídeo completo va en el reproductor, al hacer clic en la pieza.
- Requiere `ffmpeg`. Si no lo tienes: `brew install ffmpeg`.

### El orden de los vídeos

No es aleatorio (siempre sale igual con el mismo contenido), pero por defecto
lo decide un barajado automático, no tú. Para decidirlo a mano, edita
**`orden.txt`** — se crea solo la primera vez que ejecutas el generador, ya
con el orden que hubiera en ese momento como plantilla:

```
DEPORTES/Embassy.mp4
PUBLICIDAD/Twojeys.mp4
NEGOCIOS/Pepe Peluqueria.mp4
...
```

Mueve las líneas de sitio (arriba = aparece antes en la web) y vuelve a
ejecutar `node generar-datos.mjs`. No hace falta listarlos todos: lo que
dejes fuera se coloca al final, con el barajado automático de siempre. Y si
borras `orden.txt` entero, vuelve a generarse tal cual estaba la próxima vez.

Este orden es también el que se usa para decidir dónde parte el ciclo en dos
(arriba y abajo del nombre) y cómo se reparten las columnas — así que
moviendo vídeos de sitio en `orden.txt` también puedes influir en qué hueco
queda más pequeño, si alguna vez quieres afinarlo más que el propio generador.

### Que la rejilla no deje huecos

La rejilla cierra a ras cuando cada bloque de vídeos verticales tiene un
número de piezas que cuadra con las columnas (3 en escritorio, 2 en móvil).
Los bloques los separan el nombre grande del centro y los vídeos apaisados,
que ocupan una fila entera ellos solos.

Regla práctica: **procura que cada bloque tenga un número par de vídeos**, y
mejor aún si es múltiplo de 6 (cuadra con 3 y con 2 columnas a la vez). Si un
bloque no cuadra con 3, se pinta con 2 columnas pero estrechado y centrado,
así las piezas siguen midiendo lo mismo que las demás. La cabecera de
`orden.txt` explica cómo están repartidos ahora mismo.

### Cambiar el nombre que se ve sin tocar los archivos

**`titulos.txt`** separa el nombre del ARCHIVO del rótulo que se VE:

```
NEGOCIOS/Replik Hair Studio 1.mp4 = REPLIK HAIR STUDIO
NEGOCIOS/Replik Hair Studio 2.mp4 = REPLIK HAIR STUDIO
DEPORTES/Padel.mp4                = LORENA
```

Sirve para dos cosas: que **varios vídeos de un mismo cliente salgan todos
con el mismo rótulo**, y para renombrar sin renombrar el archivo (si
renombras el original hay que volver a comprimirlo y a subirlo a Cloudflare;
así no). Lo que no aparezca en la lista usa el nombre del archivo, como
siempre. Después de tocarlo: `node generar-datos.mjs`.

---

## 2. La sección de fotos

Exactamente igual que los vídeos, pero en la carpeta `fotos/`:

```
fotos/
  RETRATO/
    ana-01.jpg
  PAISAJE/
    sierra-02.jpg
```

`node generar-datos.mjs --optimizar` también las procesa: crea copias en
`fotos-web/` con el lado largo a 1800 px. Mientras la carpeta esté vacía, la
página muestra un «Sección en preparación» y no da error.

---

## 3. Cambiar textos y contacto

Todo lo editable está en **`js/config.js`**: nombre, lema, email, teléfono,
ciudad, redes y el comportamiento del scroll.

### Que los mensajes del formulario lleguen al correo

Tal cual está, el formulario **abre la aplicación de correo del visitante** con
el mensaje ya escrito. Funciona, pero se pierden bastantes: quien usa el correo
desde el navegador no tiene ninguna app que abrir y se queda a medias.

Para que el mensaje llegue solo a la bandeja de Isidro — **2 minutos, gratis,
sin crear ninguna cuenta**:

1. Entra en <https://web3forms.com>.
2. Escribe el correo donde quiere recibirlos (`Isiglez01@gmail.com`) y pulsa
   **Create Access Key**.
3. **A ese correo le llega un email con una clave larga.** Lo único que tiene
   que hacer Isidro es abrirlo y pasártela. No hay que registrarse ni poner
   tarjeta.
4. Pega la clave en `js/config.js`, dentro de `contacto.formulario.clave`, y
   lanza `./actualizar.sh`.

A partir de ahí cada mensaje le llega con el asunto «Nuevo mensaje desde la
web», y **respondiendo a ese correo le responde directamente al cliente**
(va con `reply-to`). El plan gratuito da para 250 mensajes al mes.

El formulario lleva un campo trampa invisible para robots, así que no hace falta
captcha. Y si el servicio fallara o se agotara la cuota, vuelve solo al modo de
antes en vez de dejar al visitante con un error.

La biografía y los listados de servicios/equipo están directamente en
`sobre-mi.html`, y el formulario en `contacto.html`.

Para la foto de la página *Sobre mí*, guarda tu retrato como
`posters/retrato.jpg` (si no existe, el hueco simplemente desaparece).

---

## 4. Verlo en local

Abriendo `index.html` con doble clic funciona, pero **algunos navegadores
bloquean los vídeos locales**. Lo fiable es levantar un servidor:

```bash
python3 -m http.server 8777
```

y abrir <http://localhost:8777>

---

## 5. Servir los vídeos desde Cloudflare R2 (opcional)

Para que el hosting no cargue con los vídeos, puedes ponerlos en R2 (el
almacenamiento de Cloudflare: la salida de datos no se paga).

```bash
npx wrangler login     # una sola vez, abre el navegador
./subir-r2.sh          # crea el bucket y sube previews, posters y vídeos
```

Al terminar imprime una URL tipo `https://pub-xxxxxxxx.r2.dev`. La pegas en
`js/config.js`:

```js
cdn: "https://pub-xxxxxxxx.r2.dev",
```

Y ya está: **todo el sitio tira de Cloudflare** sin tocar ni una línea más.
El script recuerda lo que ya subió, así que la segunda vez sólo sube lo nuevo.
Para subirlo todo de cero: `./subir-r2.sh --todo`.

Si dejas `cdn: ""`, se sirve desde la propia carpeta, como hasta ahora.

---

## 6. Publicarlo

Arrastra la carpeta entera a **Netlify Drop** (netlify.com/drop) o súbela por FTP.
No hay nada que compilar. Si usas GitHub Pages, sube el repo y activa Pages.

Si usaste `--optimizar`, sube **`videos-web/` pero no `videos/`**: `js/datos.js`
ya apunta a las copias ligeras y los originales sólo ocuparían espacio.

---

## 7. Cómo está montado

```
index.html        Portada: rejilla infinita + nombre + filtros
categoria.html    Una categoría de vídeo, scroll normal
fotos.html        Sección de fotos, scroll normal
sobre-mi.html     Quién es
contacto.html     Formulario y datos

css/estilos.css   Todo el diseño (tokens de color y tipografía arriba del todo)
js/config.js      ← lo que tú editas
js/datos.js       ← generado, no tocar
js/app.js         Motor del scroll infinito (sólo la portada)
js/galeria.js     Galerías de scroll normal (categorías y fotos)
js/paginas.js     Rellena datos de contacto en las páginas secundarias
generar-datos.mjs El script que lee /videos y /fotos

videos/           Tus originales (no hace falta subirlos a la web)
videos-web/       Vídeo completo con sonido, para el reproductor
previews/         Bucles ligeros de 6 s para la rejilla
fotos/ fotos-web/ Lo mismo para las fotos
posters/          Miniaturas generadas
subir-r2.sh       Sube todo lo anterior a Cloudflare R2
```

**El motor del bucle**, en corto: se construye un "ciclo" (piezas + bloque del
nombre + más piezas), se mide su altura, y se clona lo justo para cubrir la
pantalla. El scroll no es el del navegador: JS acumula el desplazamiento, lo
suaviza y lo aplica con `translate3d` usando el resto de la división entre la
altura del ciclo. Por eso nunca hay principio ni final.

**Rendimiento**, por capas:
1. La rejilla usa previas de ~200 KB, no los archivos buenos.
2. Sólo se descarga lo que está cerca de la pantalla.
3. Sólo se reproducen los que **están en pantalla de verdad** (máximo 8 en
   escritorio, 2 en móvil).
4. Lo que se aleja se pausa y se descarga de memoria, liberando decodificador.
5. Un vigilante comprueba cada 1,5 s que lo que debería moverse se mueve; si
   alguno se queda clavado, lo reintenta y recarga.

Todo ajustable en `js/config.js`.

### Diseño

- Fondo crema `#fffbf4`, tinta `#111`, acento naranja `#fa4411`.
- Tipografía display: Playfair Display (Google Fonts). Si compras la fuente
  buena, cámbiala en `--font-display` dentro de `css/estilos.css`.
- Texto pequeño en mayúsculas con la tipografía del sistema.
- Todo el espaciado sale de una sola variable: `--grid-space`.

### Atajos

- Rueda, arrastre y flechas ↑ ↓ para moverse.
- Clic en una pieza → reproductor a pantalla completa. `Esc` para cerrar.
- La portada va en bucle; las páginas de categoría y de fotos, no: se acaban.
- Botón **Filtrar** → categorías. La URL queda como `categoria.html#deportes`,
  así que se puede compartir el enlace de una categoría concreta.
