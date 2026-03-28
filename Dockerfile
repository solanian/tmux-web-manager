FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tmux git ca-certificates \
  && git clone https://github.com/gpakosz/.tmux.git /opt/oh-my-tmux \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV OH_MY_TMUX_CONF=/opt/oh-my-tmux/.tmux.conf

CMD ["node", "dist/index.js", "main"]

