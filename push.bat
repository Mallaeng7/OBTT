@echo off
set "msg=%~1"
if "%msg%"=="" set "msg=Update"
git add .
git commit -m "%msg%"
git push
