# 归档页面（legacy-pages）

这些页面已**不再被任何代码引用**，且已被 `frontend/pages/student/*.html` + JS 渲染的新版页面取代。
为避免它们继续占用可访问 URL、并带着 unpkg / jsdelivr 的 CDN 外链（断网即白屏、`lucide@latest` 无版本锁定），
于 2026-09-15 从 `frontend/pages/` 归档到这里。

它们目前**不会被服务器托管**（`express.static` 只挂载 `frontend/`，而这里是 `docs/`）。

| 归档文件 | 被谁取代 |
|---|---|
| `badge-popup.html` | `pages/student/badge.html` |
| `blackboard-classroom.html` | `pages/student/classroom.html` |
| `checkin-points.html` | `pages/student/checkin.html` |
| `error-correction.html` | `pages/student/correction.html` |
| `learning-result.html` | `pages/student/result.html` |
| `level-system.html` | `pages/student/level.html` |
| `quiz-planet.html` | `pages/student/planet.html` |
| `quiz-training.html` | `pages/student/quiz.html` |
| `student-home.html` | `pages/student/home.html` |

如需恢复：把文件搬回 `frontend/pages/` 即可（但它们依赖 Tailwind CDN，需要先补上本地样式才能离线使用）。