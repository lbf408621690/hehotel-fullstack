@echo off
chcp 65001 >nul
echo ============================================================
echo   H.O 和悦酒店项目 - 一键推送到 GitHub
echo ============================================================
echo.
echo 使用说明：
echo   1. 先在 GitHub 网页上新建一个空仓库（不要勾选 README/.gitignore）
echo   2. 用户名和仓库名已填好，如需改名请修改下面两行
echo   3. 双击本文件运行；首次会弹出 GitHub 登录窗口，登录后自动推送
echo.

set "GITHUB_USER=lbf408621690"
set "REPO_NAME=hehotel-fullstack"

echo 目标仓库：https://github.com/%GITHUB_USER%/%REPO_NAME%
echo.
pause

cd /d "%~dp0"

git remote remove origin 2>nul
git remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git
git branch -M main
git push -u origin main

echo.
echo ============================================================
echo   推送完成！打开 https://github.com/%GITHUB_USER%/%REPO_NAME% 查看
echo ============================================================
pause
