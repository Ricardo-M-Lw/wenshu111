#!/usr/bin/env bash
# ===========================================================================
# 问数星途 · 云服务器一键部署脚本（部署路线二）
# 支持：Ubuntu 20.04 / 22.04 / 24.04、Debian 11 / 12
# ---------------------------------------------------------------------------
# 用法（先把项目传到服务器，再在项目根目录里执行）：
#   sudo bash tools/deploy-server.sh                       # 只跑 HTTP，用 IP 访问
#   sudo bash tools/deploy-server.sh math.example.com      # 顺带申请 HTTPS（域名要已解析到本机）
#
# 可选环境变量：
#   LLM_API_KEY=sk-xxx     部署时就把大模型 Key 写进 .env（不传 = 走离线规则引擎）
#   CERT_EMAIL=me@qq.com   certbot 注册邮箱（不传则用 --register-unsafely-without-email）
#   APP_PORT=3000          后端监听端口
#
# 干的事：装 Node 20 → 拷代码到 /opt/wenshu → npm install → 生成 .env（自动签发 JWT_SECRET）
#        → systemd 常驻（崩溃自启 / 开机自启）→ Nginx 反向代理（已配流式响应）→ 可选 certbot HTTPS
# ===========================================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/wenshu"
SVC="wenshu"
PORT="${APP_PORT:-3000}"
NODE_MAJOR_MIN=18

BLUE=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; NC=$'\033[0m'
info() { echo "${BLUE}[*]${NC} $*"; }
ok()   { echo "${GREEN}[v]${NC} $*"; }
warn() { echo "${YELLOW}[!]${NC} $*"; }
die()  { echo "${RED}[x]${NC} $*" >&2; exit 1; }
step() { echo; echo "${BLUE}==== $* ====${NC}"; }

# ---------------------------------------------------------------------------
# 0. 前置检查
# ---------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "要用 root 运行：sudo bash tools/deploy-server.sh ${DOMAIN}"
[ -f backend/src/app.js ] || die "请在项目根目录里执行（当前目录找不到 backend/src/app.js）"
SRC_DIR="$(pwd)"
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$HOST_IP" ] || HOST_IP="<服务器IP>"

echo "问数星途 · 一键部署"
echo "  源目录    : $SRC_DIR"
echo "  目标目录  : $APP_DIR"
echo "  后端端口  : $PORT"
echo "  访问域名  : ${DOMAIN:-（未传，用 IP 访问）}"

# ---------------------------------------------------------------------------
# 1. 基础组件 + Node.js
# ---------------------------------------------------------------------------
step "1/7 安装基础组件与 Node.js"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg tar >/dev/null

node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$NODE_MAJOR_MIN" ] 2>/dev/null; then
  ok "已有 Node $(node -v)，跳过安装"
else
  info "用 NodeSource 源安装 Node.js 20（国内云主机通常几十秒）…"
  if curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource.sh; then
    bash /tmp/nodesource.sh >/dev/null 2>&1 || warn "NodeSource 脚本执行有告警，继续尝试"
    apt-get install -y -qq nodejs >/dev/null 2>&1 || true
  else
    warn "拉不到 NodeSource（外网受限？），退回系统自带源"
  fi
  if ! command -v node >/dev/null 2>&1 || [ "$(node_major)" -lt "$NODE_MAJOR_MIN" ]; then
    warn "Node 版本仍不达标，装系统自带的 nodejs / npm"
    apt-get install -y -qq nodejs npm >/dev/null
  fi
fi
command -v node >/dev/null 2>&1 || die "Node.js 没装上，请手动装 Node >= 18 再重跑本脚本"
NODE_BIN="$(command -v node)"
ok "Node $(node -v)  ($NODE_BIN)"

# ---------------------------------------------------------------------------
# 2. 同步代码到 /opt/wenshu
# ---------------------------------------------------------------------------
step "2/7 同步代码到 $APP_DIR"
mkdir -p "$APP_DIR"
tar -C "$SRC_DIR" \
    --exclude='./node_modules' \
    --exclude='./backend/node_modules' \
    --exclude='./frontend/node_modules' \
    --exclude='./.pnpm-store' \
    --exclude='./.git' \
    --exclude='./frontend/dist' \
    --exclude='./dist-package' \
    -cf - . | tar -C "$APP_DIR" -xf -
ok "代码已同步（排除了 node_modules —— 本地那份是 pnpm 软链接，拷过去也用不了，服务器上重新装）"

# ---------------------------------------------------------------------------
# 3. 生成 backend/.env
# ---------------------------------------------------------------------------
step "3/7 生成 backend/.env"
ENV_FILE="$APP_DIR/backend/.env"
SECRET="$("$NODE_BIN" -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
KEY="${LLM_API_KEY:-}"
cat > "$ENV_FILE" <<EOF
# 由 tools/deploy-server.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
PORT=$PORT
NODE_ENV=production

# 令牌签名密钥：每台机器一个随机值，别抄别人的
JWT_SECRET=$SECRET

# 大模型：留空 = 自动降级成内置离线规则引擎。
# 对外公开的机器建议留空 —— 不然任何人都能通过 /api/agent/chat 刷你的额度。
LLM_API_KEY=$KEY
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-flash
LLM_TEMPERATURE=0.6
LLM_MAX_ROUNDS=3

# 免费版每天可问小问几次
AGENT_FREE_DAILY=10
EOF
chmod 600 "$ENV_FILE"
chmod 700 "$APP_DIR/backend"
if [ -n "$KEY" ]; then ok ".env 已生成（JWT_SECRET 随机 64 位，大模型 Key 已写入）"
else ok ".env 已生成（JWT_SECRET 随机 64 位；没传 LLM_API_KEY，智能体走离线规则引擎）"; fi

# ---------------------------------------------------------------------------
# 4. 安装依赖
# ---------------------------------------------------------------------------
step "4/7 安装后端依赖"
cd "$APP_DIR/backend"
[ -d node_modules ] && rm -rf node_modules
if ! npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5; then
  warn "默认 npm 源装失败，换淘宝镜像重试"
  npm config set registry https://registry.npmmirror.com
  npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5
fi
[ -d node_modules/express ] || die "依赖没装成功（缺 express），请检查网络后重跑"
ok "依赖装好：node_modules 下 $(ls node_modules | wc -l) 个包"

# ---------------------------------------------------------------------------
# 5. systemd 常驻
# ---------------------------------------------------------------------------
step "5/7 配置 systemd 常驻服务"
id -u www-data >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin www-data
chown -R www-data:www-data "$APP_DIR"

cat > "/etc/systemd/system/$SVC.service" <<EOF
[Unit]
Description=WenShu XingTu (问数星途) - Node / Express
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $APP_DIR/backend/src/app.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SVC
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SVC" >/dev/null 2>&1 || true
systemctl restart "$SVC"
sleep 2
if systemctl is-active --quiet "$SVC"; then
  ok "服务已启动并设为开机自启"
else
  warn "服务没起来，最近日志："
  journalctl -u "$SVC" -n 30 --no-pager || true
fi

# ---------------------------------------------------------------------------
# 6. Nginx 反向代理
# ---------------------------------------------------------------------------
step "6/7 配置 Nginx 反向代理"
apt-get install -y -qq nginx >/dev/null
if [ -z "$DOMAIN" ] || echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  SERVER_NAME="_"      # 没传域名（或传的是 IP）：接住所有 Host
else
  SERVER_NAME="$DOMAIN"
fi

NGINX_SITE="/etc/nginx/sites-available/$SVC"
cat > "$NGINX_SITE" <<EOF
# 问数星途 · 由 tools/deploy-server.sh 生成
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    # 头像支持 data URL 图片，后端限 2MB，这里留点余量
    client_max_body_size 4m;

    gzip on;                       # 后端自己也压了，这层兜底静态资源
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection        "";

        # 关键：/api/agent/chat/stream 是 NDJSON 流式返回，
        # 不关缓冲会攒够一大块才吐，页面上就不是逐字出现了。
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$SVC"
if [ -e /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
  info "已移除 Nginx 默认站点（不然它会把没有 Host 的请求抢走）"
fi
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
  ok "Nginx 已加载新配置"
else
  nginx -t || true
  die "Nginx 配置校验没过，上面有具体行号"
fi

# 放行本机防火墙（云控制台的安全组还得自己去点，脚本改不了）
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ok "ufw 已放行 80 / 443"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-service=https >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "firewalld 已放行 http / https"
else
  info "没检测到开启中的 ufw / firewalld，跳过本机防火墙"
fi
warn "记得去云控制台的「安全组 / 网络防火墙」放行 80 和 443 —— 这一步只能网页上点"

# ---------------------------------------------------------------------------
# 7. 可选：HTTPS
# ---------------------------------------------------------------------------
step "7/7 HTTPS"
HTTPS_DONE=0
if [ -z "$DOMAIN" ]; then
  info "没传域名，跳过。想要 HTTPS（语音唤醒/播报必须要）就："
  echo "     sudo bash tools/deploy-server.sh 你的域名.com"
elif echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  warn "传进来的是 IP，跳过 —— Let's Encrypt 不给纯 IP 签证书，HTTPS 需要域名"
else
  info "装 certbot 并申请证书（Let's Encrypt，免费 90 天自动续期）…"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  if [ -n "${CERT_EMAIL:-}" ]; then
    EMAIL_ARG="--email $CERT_EMAIL"
  else
    EMAIL_ARG="--register-unsafely-without-email"
  fi
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect $EMAIL_ARG; then
    HTTPS_DONE=1
    ok "HTTPS 已就绪"
  else
    warn "certbot 失败 —— 多半是域名还没解析到这台机器，或者 80 端口没通。"
    warn "确认后重跑：sudo bash tools/deploy-server.sh $DOMAIN"
  fi
fi

# ---------------------------------------------------------------------------
# 收尾：健康检查 + 访问信息
# ---------------------------------------------------------------------------
cd /
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo 000)"

echo
echo "============================================================"
if [ "$CODE" = "200" ]; then
  echo "${GREEN}部署完成${NC}"
else
  echo "${YELLOW}部署跑完了，但本机健康检查返回 $CODE，建议先排错${NC}"
fi
echo "============================================================"
BODY="$(curl -s "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)"
[ -n "$BODY" ] && echo "健康检查 : $BODY"
echo
if [ "$HTTPS_DONE" = "1" ]; then
  echo "对外地址 : https://$DOMAIN/pages/auth/login.html"
  echo "（HTTPS 下语音唤醒 / 语音播报可用）"
else
  echo "对外地址 : http://$HOST_IP/pages/auth/login.html"
  echo "（http 下浏览器禁用麦克风，语音功能会隐藏，键盘输入不受影响）"
fi
echo "演示账号 : 学生 13800000001 / 123456    教师 teacher / 123456    运营 admin / admin123"
echo
echo "常用命令："
echo "  看日志   : journalctl -u $SVC -f"
echo "  重启     : sudo systemctl restart $SVC"
echo "  改配置   : sudo nano $ENV_FILE  然后 sudo systemctl restart $SVC"
echo "  更新代码 : 重新上传后在项目根目录再跑一次本脚本"
echo
echo "提醒：数据存在内存里，重启 / 重跑脚本会回到初始演示数据（详见 部署文档.md 第 7 节）"