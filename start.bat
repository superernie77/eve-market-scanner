@echo off
cd /d "%~dp0"

start "EVE Backend" cmd /k "cd backend && mvnw spring-boot:run"
start "EVE Frontend" cmd /k "cd frontend && npx ng serve --open"
