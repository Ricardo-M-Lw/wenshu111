# 问数星途 · 生产镜像
# 构建：docker build -t wenshu-fullstack .
# 运行：docker run -d --name wenshu -p 3000:3000 --env-file backend/.env wenshu-fullstack
FROM node:20-alpine

WORKDIR /app

# 先装依赖，利用层缓存（只改业务代码时不用重装）
#
# 这里故意用 npm install，而不是 pnpm install --frozen-lockfile：
#   - 仓库里只有 backend/pnpm-lock.yaml（本地是 pnpm 装的），而 node 镜像里没有 pnpm；
#   - 这 4 个依赖 express / cors / dotenv / uuid 都在维护期且用 ^ 限位，
#     npm 解出来的版本与锁文件基本一致；
#   - 换成 pnpm --frozen-lockfile 会引入新坑：以后改了 package.json 忘了更新锁文件，
#     镜像构建会直接失败。对还在加功能的项目不划算。
# 想严格锁版本就改成：
#   RUN npm install -g pnpm@9 --no-audit --no-fund \
#    && cd backend && pnpm install --prod --frozen-lockfile
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund

# 业务代码 + 前端静态资源（后端按 ../../frontend 找前端目录，两个目录必须并列）
COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/backend
CMD ["node", "src/app.js"]