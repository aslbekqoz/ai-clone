# API va worker uchun bitta obraz:  docker build -t aiclone .
#   API:     docker run aiclone            (sukut bo'yicha)
#   Worker:  docker run aiclone worker
# Paketlar TypeScript manbasini eksport qiladi — ishga tushirish tsx orqali, alohida build bosqichi yo'q.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Avval faqat manifestlar — kod o'zgarsa, bog'liqliklar qatlami keshdan olinadi.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
# tsx (ishga tushirish) root devDependency'da — shuning uchun NODE_ENV o'rnatishdan oldin to'liq o'rnatiladi.
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production

COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY apps apps
COPY deploy/entrypoint.sh deploy/entrypoint.sh

USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
CMD ["api"]
