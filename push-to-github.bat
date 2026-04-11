@echo off
echo ============================================
echo   MedStore - Pushing to GitHub
echo ============================================

git init
git add .
git commit -m "Medical Store System - Deployment Ready"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/khawale01/medicalstoresys.git
git push -u origin main

echo.
echo ============================================
echo   DONE! Check https://github.com/khawale01/medicalstoresys
echo ============================================
pause
