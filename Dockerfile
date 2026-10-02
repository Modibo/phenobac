# PhénoBac — image du serveur auto-hébergé.
# Léger (Alpine), non-root, données dans un volume, secrets injectés au lancement.

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# 1) dépendances (couche mise en cache tant que package*.json ne change pas)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2) code applicatif (on ne copie que le nécessaire ; voir .dockerignore)
COPY server.js ./
# Le raisonnement, chargé par la fonction serveur (require("../../moteur"))
# ET servi au navigateur depuis public/. Sans cette ligne, l'image démarre et
# l'API tombe au premier appel.
COPY moteur.js ./
COPY netlify ./netlify
COPY public ./public

# 3) dossier de données : le volume monté héritera de ce propriétaire
RUN mkdir -p /data && chown -R node:node /data /app

# valeurs d'exploitation (surchargées par docker-compose au besoin)
ENV STORE_BACKEND=file \
    DATA_DIR=/data \
    PORT=8080

USER node
EXPOSE 8080

# sonde de santé : interroge /healthz sans dépendance externe
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
