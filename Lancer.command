#!/bin/sh
# Builds the pages if needed, starts the TokenDex server and opens the Pokédex. Closing this window stops the server.
cd "$(dirname "$0")"
URL=http://127.0.0.1:8649/

if curl -fs -o /dev/null "$URL"; then
  echo "Le serveur tourne déjà : $URL"
  open "$URL"
  exit 0
fi
if ! python3 -c '' 2>/dev/null; then
  echo "Python 3 manque : accepte l'installation des outils de développement que macOS propose, puis relance ce fichier."
  exit 1
fi
if ! command -v npm >/dev/null; then
  echo "Node manque : installe-le (brew install node), puis relance ce fichier."
  exit 1
fi
# Dependencies after a change of package-lock.json, pages after a change of their sources.
if [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install || exit 1
fi
if [ ! -f dist/index.html ] || [ -n "$(find src *.html package-lock.json vite.config.ts -newer dist/index.html | head -1)" ]; then
  npm run build || exit 1
fi

python3 serve.py &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT HUP INT TERM
for i in $(seq 20); do
  curl -fs -o /dev/null "$URL" && break
  sleep 0.5
done
open "$URL"
echo "Serveur lancé sur $URL"
echo "Ferme cette fenêtre (ou Ctrl+C) pour l'arrêter."
wait $PID
