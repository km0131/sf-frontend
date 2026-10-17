# ---- 依存パッケージ ----
FROM node:24-alpine AS deps
WORKDIR /app
# 開発時にホストのファイル（UID 1000）を読み書きできるよう、node ユーザー（UID 1000）で動かす
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# ---- 開発サーバー（docker compose up で使う。ソースはマウントしてホットリロード） ----
FROM deps AS dev
EXPOSE 5173
# node_modules は名前付きボリュームなので、イメージを作り直しても中身は古いまま残る。
# package-lock.json が前回の起動から変わっていたら、起動前に入れ直す。
CMD ["sh", "-c", "sum=$(sha256sum package-lock.json); [ \"$(cat node_modules/.lock-sum 2>/dev/null)\" = \"$sum\" ] || { npm install --no-audit --no-fund && echo \"$sum\" > node_modules/.lock-sum; }; exec npm run dev"]

# ---- 本番ビルド ----
FROM deps AS build
# API の URL はビルド時に埋め込まれる（例: https://api.example.com）
ARG VITE_API_BASE_URL
ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
COPY --chown=node:node . .
RUN npm run build

# ---- ビルド結果だけを取り出す ----
#   docker build --target dist --build-arg VITE_API_BASE_URL=https://api.example.com -o dist .
FROM scratch AS dist
COPY --from=build /app/dist /

# ---- ビルド結果の確認用（本番と同じ静的ファイルを nginx で配信） ----
FROM nginx:1.29-alpine AS preview
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# _headers の「/*」の部分を nginx の add_header に書き換える（_headers 自体は配信しない）
RUN awk '/^\/\*$/ { on = 1; next } /^[^ ]/ { on = 0 } on && /^  [^:]+: / { \
        name = $1; sub(/:$/, "", name); value = $0; sub(/^  [^:]+: /, "", value); \
        printf "add_header %s \"%s\" always;\n", name, value }' \
      /usr/share/nginx/html/_headers > /etc/nginx/security-headers.conf \
 && rm /usr/share/nginx/html/_headers
EXPOSE 80
