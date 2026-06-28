﻿@echo off
chcp 65001 >nul
title OpenVibe - OpenCode Vibe Coding 伴侣 (v2026.02.25)

echo ================================================
echo 🚀 OpenVibe 启动器 - 桌面启动 · 手机扫码接管
echo ================================================

:: 检查端口占用
netstat -ano | findstr ":8000" >nul && echo [警告] 端口 8000 被占用，正在尝试释放... && taskkill /F /PID $(netstat -ano | findstr ":8000" | awk '{print $5}') 2>nul

:: 启动后端 (FastAPI + OpenCode 支持)
echo [1/3] 启动后端服务 (http://localhost:8000)...
start /B cmd /c "cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: 等待后端就绪
timeout /t 3 >nul

:: 启动前端 (Vite dev)
echo [2/3] 启动前端 (http://localhost:5173)...
start /B cmd /c "cd frontend && npm run dev"

echo [3/3] 生成二维码...
echo.
echo 请用手机扫码连接（或直接打开 http://你的局域网IP:5173）
echo.
echo ================================================
echo ✅ OpenVibe 已启动！Walking Mode 已就绪
echo 按 Ctrl+C 关闭所有服务
echo ================================================

:: 显示 ASCII QR（推荐安装 qrcode 后端自动生成，这里用简单提示）
echo 如需自动二维码，请确保 backend 已安装 qrcode 库
pause
