@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Авто-деплой на GitHub v3.3 (Safe: No Delete Secrets)

:: ---------- КОНФИГУРАЦИЯ ----------
set "REPO_NAME=wwwmanager/PL/"
set "ARCHIVE_MASK=*.zip"
:: ---------------------------------

set "LOGFILE=%CD%\deploy_log.txt"
echo [%DATE% %TIME%] == Начало выполнения скрипта == > "%LOGFILE%"

call :Log "=============================================="
call :Log "  Автоматический деплой проекта на GitHub"
call :Log "  Репозиторий: !REPO_NAME!"
call :Log "  Режим: Обновление (Секреты сохраняются)"
call :Log "=============================================="

:: ========== Шаг 1: Проверка утилит ==========
call :Log ""
call :Log "[1/6] Проверка окружения..."
:: (Пропускаем детальную установку для краткости, предполагаем, что все уже стоит после прошлых разов)
where git >nul 2>&1 || (call :Log "[ERR] Git не найден!" & goto :ErrorEnd)
where node >nul 2>&1 || (call :Log "[ERR] Node не найден!" & goto :ErrorEnd)
where gh >nul 2>&1 || (call :Log "[ERR] GitHub CLI не найден!" & goto :ErrorEnd)

call :Log "Проверка входа в GitHub..."
gh auth status >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ВНИМАНИЕ] Нужен вход в GitHub CLI."
    gh auth login
)

:: ========== ВАЖНОЕ ИЗМЕНЕНИЕ: НЕ УДАЛЯЕМ РЕПОЗИТОРИЙ ==========
:: Мы просто пропускаем шаг удаления.

:: ========== Шаг 2: Поиск и распаковка ==========
call :Log "Очистка рабочей директории..."
if exist "src" rmdir /s /q "src"
if exist "public" rmdir /s /q "public"
if exist "dist" rmdir /s /q "dist"

call :Log ""
call :Log "[2/6] Поиск архива..."
set "ARCHIVE_FILE="
for %%F in (%ARCHIVE_MASK%) do (
    set "ARCHIVE_FILE=%%F"
    goto :ArchiveFound
)
:NoArchiveByMask
if not defined ARCHIVE_FILE (
    set /p ARCHIVE_FILE=Введите имя архива: 
)
:ArchiveFound
call :Log "[OK] Архив: !ARCHIVE_FILE!"

set "EXTRACT_FOLDER=%CD%\temp_extract_%RANDOM%"
powershell -NoProfile -Command "Expand-Archive -Path '!ARCHIVE_FILE!' -DestinationPath '!EXTRACT_FOLDER!' -Force" >> "%LOGFILE%" 2>&1

set "PROJECT_FOLDER="
if exist "!EXTRACT_FOLDER!\package.json" set "PROJECT_FOLDER=!EXTRACT_FOLDER!"
if not defined PROJECT_FOLDER (
    for /d %%D in ("!EXTRACT_FOLDER!\*") do (
        if exist "%%D\package.json" set "PROJECT_FOLDER=%%D"
    )
)
if not defined PROJECT_FOLDER (
    call :Log "[ERR] package.json не найден!" & goto :ErrorEnd
)

xcopy "!PROJECT_FOLDER!\*" "%CD%\" /E /I /H /Y /Q >> "%LOGFILE%"
rmdir /s /q "!EXTRACT_FOLDER!" 2>nul
call :Log "[OK] Распаковано."

:: ========== Шаг 3: Конфиги ==========
call :Log ""
call :Log "[3/6] Генерация конфигов..."

(
    echo(# Logs
    echo(logs
    echo(*.log
    echo(node_modules
    echo(/dist
    echo(.env
    echo(.env*.local
    echo(.vscode
    echo(.idea
    echo(.DS_Store
) > .gitignore

(
    echo(import * as path from 'node:path';
    echo(import { defineConfig } from 'vite';
    echo(import react from '@vitejs/plugin-react';
    echo(
    echo(const REPO_NAME = 'PL';
    echo(
    echo(export default defineConfig(({ mode }) => {
    echo(  return {
    echo(    base: mode === 'production' ? '/' + REPO_NAME + '/' : '/',
    echo(    plugins: [react()],
    echo(    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    echo(    build: { outDir: 'dist', assetsDir: 'assets' }
    echo(  };
    echo(});
) > vite.config.ts

if not exist ".github\workflows" mkdir .github\workflows
(
    echo(name: Deploy to GitHub Pages
    echo(on:
    echo(  push:
    echo(    branches: ["main"]
    echo(  workflow_dispatch:
    echo(permissions:
    echo(  contents: read
    echo(  pages: write
    echo(  id-token: write
    echo(jobs:
    echo(  build:
    echo(    runs-on: ubuntu-latest
    echo(    steps:
    echo(      - uses: actions/checkout@v4
    echo(      - uses: actions/setup-node@v4
    echo(        with: { node-version: "20", cache: "npm" }
    echo(      - run: npm ci
    echo(      - run: npm run build
    echo(        env:
    echo(          VITE_REPO_NAME: "PL"
    echo(          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    echo(          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    echo(          VITE_TELEGRAM_BOT_TOKEN: ${{ secrets.VITE_TELEGRAM_BOT_TOKEN }}
    echo(          VITE_TELEGRAM_CHAT_ID: ${{ secrets.VITE_TELEGRAM_CHAT_ID }}
    echo(          VITE_YANDEX_METRIKA_ID: ${{ secrets.VITE_YANDEX_METRIKA_ID }}
    echo(      - uses: actions/upload-pages-artifact@v3
    echo(        with: { path: './dist' }
    echo(  deploy:
    echo(    needs: build
    echo(    environment:
    echo(      name: github-pages
    echo(      url: ${{ steps.deployment.outputs.page_url }}
    echo(    runs-on: ubuntu-latest
    echo(    steps:
    echo(      - id: deployment
    echo(        uses: actions/deploy-pages@v4
) > .github\workflows\deploy.yml

:: ========== Шаг 4: Установка ==========
call :Log ""
call :Log "[4/6] Установка зависимостей..."
:: Настройки прокси (если нужно)
set "PROXY_URL=http://127.0.0.1:10809"
call npm config set proxy !PROXY_URL!
call npm config set https-proxy !PROXY_URL!
call npm config set strict-ssl false

if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del /f /q "package-lock.json"

call npm install xlsx
call npm install -D tailwindcss postcss autoprefixer
call npx tailwindcss init -p >> "%LOGFILE%" 2>&1
call npm install

call npm config delete proxy
call npm config delete https-proxy
call npm config delete strict-ssl

:: ========== Шаг 5: Git Init ==========
call :Log ""
call :Log "[5/6] Подготовка Git..."
:: Мы каждый раз инициализируем заново, чтобы не было конфликтов с историей локальной папки
if exist ".git" rmdir /s /q ".git"
git init -b main >> "%LOGFILE%" 2>&1
git add . >> "%LOGFILE%" 2>&1
git commit -m "Auto deploy update" >> "%LOGFILE%" 2>&1

:: ========== Шаг 6: Push (Умный) ==========
call :Log ""
call :Log "[6/6] Отправка на GitHub..."

:: Проверяем, существует ли репо
gh repo view !REPO_NAME! >nul 2>&1
if !errorlevel! neq 0 (
    call :Log "[INFO] Репозиторий не найден. Создаю новый..."
    :: Если нет - создаем
    gh repo create !REPO_NAME! --public --source=. --remote=origin --push >> "%LOGFILE%" 2>&1
    call :Log "[WARN] Репозиторий создан с нуля. НЕ ЗАБУДЬТЕ ДОБАВИТЬ СЕКРЕТЫ В GITHUB!"
    
    :: Настраиваем Pages
    gh api -X PUT "repos/!REPO_NAME!/pages" -f build_type=workflow --silent
) else (
    call :Log "[INFO] Репозиторий найден. Обновляем..."
    :: Если есть - просто добавляем remote и пушим с --force
    :: --force нужен, так как мы пересоздали .git локально и история не совпадает
    git remote add origin https://github.com/!REPO_NAME!.git
    git push -u origin main --force >> "%LOGFILE%" 2>&1
    call :Log "[OK] Код обновлен. Секреты GitHub должны сохраниться."
)

call :Log ""
call :Log "================== ГОТОВО =================="
call :Log "Сайт: https://wwwmanager.github.io/PL/"
call :Log "Если это был первый запуск нового скрипта - проверьте Секреты в GitHub!"
goto :END

:Log
set "MSG=%~1"
echo %MSG%
echo [%DATE% %TIME%] %MSG% >> "%LOGFILE%"
exit /b 0

:ErrorEnd
call :Log "[!!!] ОШИБКА. См. лог."
:END
pause
exit /b 0