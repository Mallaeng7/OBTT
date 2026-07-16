@echo off
set msg=%*
if "%msg%"=="" set msg="Update"
git add .
git commit -m "%msg%"
git push
