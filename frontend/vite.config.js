import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'auth-login': resolve(__dirname, 'pages/auth/login.html'),
        'auth-register': resolve(__dirname, 'pages/auth/register.html'),
        'student-home': resolve(__dirname, 'pages/student/home.html'),
        'student-classroom': resolve(__dirname, 'pages/student/classroom.html'),
        'student-quiz': resolve(__dirname, 'pages/student/quiz.html'),
        'student-correction': resolve(__dirname, 'pages/student/correction.html'),
        'student-result': resolve(__dirname, 'pages/student/result.html'),
        'student-planet': resolve(__dirname, 'pages/student/planet.html'),
        'student-checkin': resolve(__dirname, 'pages/student/checkin.html'),
        'student-badge': resolve(__dirname, 'pages/student/badge.html'),
        'student-level': resolve(__dirname, 'pages/student/level.html'),
        'student-agent': resolve(__dirname, 'pages/student/agent.html'),
        'student-report': resolve(__dirname, 'pages/student/report.html'),
        'admin-console': resolve(__dirname, 'pages/admin/console.html'),
      },
    },
  },
})
