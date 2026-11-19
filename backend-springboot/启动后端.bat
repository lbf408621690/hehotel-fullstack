@echo off
chcp 65001 >nul
title 和悦酒店后端服务 (Spring Boot 2.0.5 + Java 21 兼容模式)
cd /d D:\project\hotel

set "MAVEN_OPTS=--add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.lang.reflect=ALL-UNNAMED"

echo ============================================================
echo   和悦酒店后端启动中...
echo   Spring Boot 2.0.5 跑在 Java 21 上，已自动加上兼容参数
echo   启动完成后访问: http://localhost:8080/ho-api
echo ============================================================
echo.

mvn spring-boot:run

echo.
echo 后端已停止。
pause
