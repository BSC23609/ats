@echo off
setlocal enabledelayedexpansion
title Bharat Steel ATS - push to GitHub

echo.
echo  ============================================
echo   Bharat Steel ATS  -  push to GitHub
echo  ============================================
echo.

rem --- Work from the folder this script sits in, wherever it was launched from ---
cd /d "%~dp0"

rem --- 1. Is git installed? ---
where git >nul 2>&1
if errorlevel 1 (
  echo  [X] Git is not installed.
  echo.
  echo      Download it from  https://git-scm.com/download/win
  echo      Install with all the default options, then run this again.
  echo.
  pause
  exit /b 1
)

rem --- 2. Who is committing? Git refuses to commit without this. ---
git config user.email >nul 2>&1
if errorlevel 1 (
  echo  Git needs to know who you are. This is stored once, on this PC.
  echo.
  set /p GITNAME="  Your name          : "
  set /p GITMAIL="  Your email         : "
  git config --global user.name "!GITNAME!"
  git config --global user.email "!GITMAIL!"
  echo.
)

rem --- 3. First run: create the repo and connect it to GitHub ---
if not exist ".git" (
  echo  Setting up this folder as a git repository...
  git init -b main >nul
  echo.
  echo  Now paste the address of your EMPTY GitHub repository.
  echo  On GitHub:  New repository  -  name it  bharat-steel-ats  -  set it PRIVATE
  echo              - do NOT tick "Add a README" - Create.
  echo  Then copy the URL from the address bar. It looks like:
  echo.
  echo      https://github.com/your-name/bharat-steel-ats
  echo.
  set /p REPOURL="  Repository URL     : "
  git remote add origin "!REPOURL!"
  echo.
)

rem --- 4. Show what is about to be sent ---
echo  Staging files...
git add -A

echo.
echo  ------------------------------------------------
git status --short
echo  ------------------------------------------------
echo.
echo  node_modules, .env and uploads are excluded on purpose
echo  (.gitignore). Your API key must never reach GitHub.
echo.

rem --- 5. Commit ---
set "MSG="
set /p MSG="  Message (Enter for 'Update'): "
if "!MSG!"=="" set "MSG=Update"

git commit -m "!MSG!" >nul 2>&1
if errorlevel 1 (
  echo  Nothing to commit - no files changed since last push.
) else (
  echo  Committed.
)

rem --- 6. Push ---
echo.
echo  Pushing to GitHub...
echo  (First time only: a browser window opens to sign you in.)
echo.

git push -u origin main
if errorlevel 1 (
  echo.
  echo  ------------------------------------------------
  echo   Push was rejected.
  echo  ------------------------------------------------
  echo.
  echo  The usual cause: GitHub created the repo with a README
  echo  or a .gitignore, so it is not empty, and git will not
  echo  overwrite something it thinks you have not seen.
  echo.
  echo  If that repo has nothing in it you care about - only the
  echo  README GitHub added for you - it is safe to overwrite.
  echo.
  set "FORCE="
  set /p FORCE="  Overwrite what is on GitHub with this folder? (y/N): "
  if /i "!FORCE!"=="y" (
    echo.
    echo  Overwriting...
    git push -u origin main --force
    if errorlevel 1 (
      echo.
      echo  [X] Still failing. Other things to check:
      echo        - Sign-in cancelled? Run this again.
      echo        - Wrong URL? Fix it with:
      echo            git remote set-url origin https://github.com/you/bharat-steel-ats
      echo.
      pause
      exit /b 1
    )
  ) else (
    echo.
    echo  Nothing was pushed. Delete the repo on GitHub and create a
    echo  fresh one with NOTHING ticked, then run this again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo  ============================================
echo   Done. Everything is on GitHub.
echo.
echo   Next:  open your repo, check that .devcontainer
echo          is listed, then  Code - Codespaces - Create.
echo  ============================================
echo.
pause
