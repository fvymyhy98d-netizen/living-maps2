@echo off
cd /d "%~dp0"
node build-libs.js > t14.txt 2>&1
node --check js\yjstcb.js >> t14.txt 2>&1
