@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Авто-деплой на GitHub v3.0 (Исправлено)

:: ---------- КОНФИГУРАЦИЯ ----------
set "REPO_NAME=wwwmanager/PL"
set "ZIP_NAME=*.zip"
:: ---------------------------------

set "LOGFILE=%CD%\deploy_log.txt"
echo [%DATE% %TIME%] == Начало выполнения скрипта == > "%LOGFILE%"

call :Log "=============================================="
call :Log "  Автоматический деплой проекта на GitHub"
call :Log "  Репозиторий: !REPO_NAME!"
call :Log "=============================================="

:: ========== Шаг 1: Проверка и установка утилит ==========
:: (Этот шаг не изменился, он работает)
call :Log ""
call :Log "[1/7] Проверка системных утилит..."
where winget >nul 2>&1
if !errorlevel! neq 0 (
    call :Log "[ОШИБКА] 'winget' (Установщик приложений Windows) не найден."
    goto :ErrorEnd
)
call :Log "[OK] Установщик 'winget' найден."

where git >nul 2>&1
if !errorlevel! neq 0 (
    call :Log "[ВНИМАНИЕ] Git не найден. Пытаюсь установить..."
    winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements >> "%LOGFILE%" 2>&1
    where git >nul 2>&1
    if !errorlevel! neq 0 (
        call :Log "[ОШИБКА] Не удалось установить Git."
        goto :ErrorEnd
    )
    call :Log "[OK] Git успешно установлен."
) else (
    call :Log "[OK] Git найден."
)

where node >nul 2>&1
if !errorlevel! neq 0 (
    call :Log "[ВНИМАНИЕ] Node.js (npm) не найден. Пытаюсь установить..."
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements >> "%LOGFILE%" 2>&1
    call :RefreshPath
    where node >nul 2>&1
    if !errorlevel! neq 0 (
        call :Log "[ОШИБКА] Не удалось установить Node.js."
        goto :ErrorEnd
    )
    call :Log "[OK] Node.js (npm) успешно установлен."
) else (
    call :Log "[OK] Node.js (npm) найден."
)

where gh >nul 2>&1
if !errorlevel! neq 0 (
    call :Log "[ВНИМАНИЕ] GitHub CLI ('gh') не найден. Пытаюсь установить..."
    winget install --id GitHub.Cli --silent --accept-package-agreements --accept-source-agreements >> "%LOGFILE%" 2>&1
    where gh >nul 2>&1
    if !errorlevel! neq 0 (
        call :Log "[ОШИБКА] Не удалось установить 'gh'."
        goto :ErrorEnd
    )
    call :Log "[OK] GitHub CLI успешно установлен."
) else (
    call :Log "[OK] GitHub CLI найден."
)

call :Log "Проверка аутентификации GitHub CLI..."
gh auth status >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ВНИМАНИЕ!] Вы не вошли в GitHub CLI."
    call :Log "Сейчас откроется браузер для входа."
    call :Log "Нажмите Enter, когда будете готовы начать вход..."
    pause
    gh auth login
    gh auth status >> "%LOGFILE%" 2>&1
    if !errorlevel! neq 0 (
         call :Log "[ОШИБКА] Вход не выполнен. Скрипт не может продолжить."
         goto :ErrorEnd
    )
    call :Log "[OK] Вы успешно аутентифицированы."
) else (
    call :Log "[OK] Вы уже аутентифицированы."
)

:: ========== Шаг 2: Распаковка архива ==========
:: (Этот шаг не изменился)
call :Log ""
call :Log "[2/7] Поиск и распаковка архива '!ZIP_NAME!'..."
if not exist "!ZIP_NAME!" (
    call :Log "[ОШИБКА] Архив '!ZIP_NAME!' не найден."
    goto :ErrorEnd
)
set "EXTRACT_FOLDER=%CD%\temp_extract_%RANDOM%"
call :Log "Распаковка во временную папку: !EXTRACT_FOLDER!"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '!ZIP_NAME!' -DestinationPath '!EXTRACT_FOLDER!' -Force" >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ОШИБКА] Не удалось распаковать архив."
    rmdir /s /q "!EXTRACT_FOLDER!" 2>nul
    goto :ErrorEnd
)
set "PROJECT_FOLDER="
if exist "!EXTRACT_FOLDER!\package.json" (
    set "PROJECT_FOLDER=!EXTRACT_FOLDER!"
    call :Log "Проект найден в корне архива."
) else (
    for /d %%D in ("!EXTRACT_FOLDER!\*") do (
        if exist "%%D\package.json" (
            set "PROJECT_FOLDER=%%D"
            call :Log "Проект найден в подпапке: %%D"
            goto :FoundProject
        )
    )
)
:FoundProject
if not defined PROJECT_FOLDER (
    call :Log "[ОШИБКА] Не найден package.json в распакованном архиве."
    rmdir /s /q "!EXTRACT_FOLDER!" 2>nul
    goto :ErrorEnd
)
call :Log "Перемещение файлов проекта в корень..."
xcopy "!PROJECT_FOLDER!\*" "%CD%\" /E /I /H /Y /Q >> "%LOGFILE%"
rmdir /s /q "!EXTRACT_FOLDER!" 2>nul
call :Log "[OK] Исходники проекта извлечены."

:: ========== Шаг 3: Внедрение конфигурационных файлов (ИСПРАВЛЕНО) ==========
call :Log ""
call :Log "[3/7] Внедрение файлов .gitignore, vite.config.ts и deploy.yml..."

:: Создаем .gitignore
call :Log "Создание .gitignore..."
(
    echo(# Logs
    echo(logs
    echo(*.log
    echo(npm-debug.log*
    echo(yarn-debug.log*
    echo(yarn-error.log*
    echo(pnpm-debug.log*
    echo(lerna-debug.log*
    echo(
    echo(# Node
    echo(/node_modules
    echo(
    echo(# Production
    echo(/dist
    echo(
    echo(# Env
    echo(.env
    echo(.env*.local
    echo(
    echo(# Editor
    echo(.vscode
    echo(.idea
    echo(.DS_Store
) > .gitignore

:: Создаем vite.config.ts
call :Log "Создание vite.config.ts..."
(
    echo(import path from 'path';
    echo(import { defineConfig } from 'vite';
    echo(import react from '@vitejs/plugin-react';
    echo(
    echo(// Имя репозитория (БЕРЕТСЯ ИЗ ПЕРЕМЕННОЙ ОКРУЖЕНИЯ)
    echo(const REPO_NAME = process.env.VITE_REPO_NAME || 'PL';
    echo(
    echo(export default defineConfig(({ mode }) => {
    echo(  const isProduction = mode === 'production';
    echo(
    echo(  return {
    echo(    // Устанавливаем base
    echo(    base: isProduction ? `/${REPO_NAME}/` : '/',
    echo(
    echo(    plugins: [react()],
    echo(
    echo(    server: {
    echo(      port: 3000,
    echo(      host: '0.0.0.0',
    echo(    },
    echo(
    echo(    resolve: {
    echo(      alias: {
    echo(        '@': path.resolve(__dirname, './src'),
    echo(      },
    echo(    },
    echo(  };
    echo(});
) > vite.config.ts

:: Создаем deploy.yml
call :Log "Создание .github/workflows/deploy.yml..."
if not exist ".github" mkdir .github
if not exist ".github\workflows" mkdir .github\workflows

(
    echo(name: Deploy to GitHub Pages
    echo(
    echo(on:
    echo(  # Запускать при пуше в main
    echo(  push:
    echo(    branches: ["main"]
    echo(  # Позволяет запускать вручную
    echo(  workflow_dispatch:
    echo(
    echo(# Настройка прав
    echo(permissions:
    echo(  contents: read
    echo(  pages: write
    echo(  id-token: write
    echo(
    echo(jobs:
    echo(  build:
    echo(    runs-on: ubuntu-latest
    echo(    steps:
    echo(      - name: Checkout repository
    echo(        uses: actions/checkout@v4
    echo(
    echo(      - name: Set up Node.js
    echo(        uses: actions/setup-node@v4
    echo(        with:
    echo(          node-version: "20"
    echo(          cache: "npm"
    echo(
    echo(      - name: Install dependencies
    echo(        run: npm ci
    echo(
    echo(      - name: Build project
    echo(        run: npm run build
    echo(        env:
    echo(          VITE_REPO_NAME: ${REPO_NAME##*/}
    echo(
    echo(      - name: Upload artifact
    echo(        uses: actions/upload-pages-artifact@v3
    echo(        with:
    echo(          path: './dist'
    echo(
    echo(  deploy:
    echo(    # Деплой только после сборки
    echo(    needs: build
    echo(    environment:
    echo(      name: github-pages
    echo(      url: ${"$"}{{ steps.deployment.outputs.page_url }}
    echo(    runs-on: ubuntu-latest
    echo(    steps:
    echo(      - name: Deploy to GitHub Pages
    echo(        id: deployment
    echo(        uses: actions/deploy-pages@v4
) > .github\workflows\deploy.yml

call :Log "[OK] Все 3 файла успешно созданы."

:: ========== Шаг 4: Установка зависимостей ==========
:: (Этот шаг не изменился)
call :Log ""
call :Log "[4/7] Установка зависимостей (npm install)..."
call :Log "Это создаст правильный package-lock.json. Может занять 1-2 минуты..."
call npm install >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ОШИБКА] 'npm install' завершился с ошибкой."
    goto :ErrorEnd
)
call :Log "[OK] Зависимости установлены, package-lock.json создан."

:: ========== Шаг 5: Инициализация Git ==========
:: (Этот шаг не изменился)
call :Log ""
call :Log "[5/7] Инициализация Git и первый коммит..."
git init -b main >> "%LOGFILE%" 2>&1
git add . >> "%LOGFILE%" 2>&1
git commit -m "Initial automated deploy" >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ОШИБКА] Не удалось создать Git коммит."
    goto :ErrorEnd
)
call :Log "[OK] Локальный репозиторий создан."

:: ========== Шаг 6: Создание и Публикация на GitHub ==========
:: (Этот шаг не изменился)
call :Log ""
call :Log "[6/7] Создание репозитория '!REPO_NAME!' на GitHub..."
call :Log "Выполняю gh repo create..."
gh repo create !REPO_NAME! --public --source=. --remote=origin --push >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ОШИБКА] 'gh repo create' не удался."
    call :Log "Возможные причины:"
    call :Log " 1. Репозиторий '!REPO_NAME!' уже существует (вы забыли его удалить?)."
    call :Log " 2. У вас нет прав."
    goto :ErrorEnd
)
call :Log "[OK] Репозиторий создан и код отправлен."

:: ========== Шаг 7: Настройка GitHub Pages ==========
:: (Этот шаг не изменился)
call :Log ""
call :Log "[7/7] Настройка GitHub Pages на использование 'GitHub Actions'..."
gh api -X PUT "repos/!REPO_NAME!/pages" -f build_type=workflow --silent >> "%LOGFILE%" 2>&1
if !errorlevel! neq 0 (
    call :Log "[ОШИБКА] Не удалось настроить GitHub Pages."
    call :Log "Вам придется включить 'GitHub Actions' в 'Settings > Pages' вручную."
) else (
    call :Log "[OK] GitHub Pages настроены."
)

:: ========== УСПЕХ ==========
call :Log ""
call :Log "=============================================="
call :Log "                 !! УСПЕХ !! "
call :Log "=============================================="
call :Log "Что произошло:"
call :Log "1. Все утилиты (Git, Node, GH CLI) установлены/проверены."
call :Log "2. Исходники распакованы, файлы конфига добавлены."
call :Log "3. Создан репозиторий: https://github.com/!REPO_NAME!"
call :Log "4. Код отправлен, и Action 'Deploy to GitHub Pages' запущен."
call :Log "5. Настройки Pages установлены на 'GitHub Actions' (или выдано предупреждение)."
call :Log ""
call :Log "!! ВАШЕ ДЕЙСТВИЕ !!"
call :Log "Просто подождите 2-3 минуты. Ваш сайт будет доступен по адресу:"
call :Log "https://wwwmanager.github.io/PL/"
call :Log "(Можете следить за прогрессом на вкладке 'Actions' в репозитории)"
call :Log ""
call :Log "Лог файл: deploy_log.txt"
goto :END

:: ---------- Подпрограммы ----------
:Log
set "MSG=%~1"
echo %MSG%
echo [%DATE% %TIME%] %MSG% >> "%LOGFILE%"
exit /b 0

:RefreshPath
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "[Console]::Out.Write(([Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentтVariable('Path','Machine')))"`) do set "PATH=%%p"
exit /b 0

:ErrorEnd
call :Log ""
call :Log "[!!!] Скрипт завершился с ошибкой."
call :Log "Пожалуйста, проверьте deploy_log.txt для деталей."

:END
echo.
echo Нажмите любую клавишу для выхода...
pause >nul
exit /b 0