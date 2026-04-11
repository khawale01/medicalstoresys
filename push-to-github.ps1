$git = "C:\Users\Gauree\AppData\Local\GitHubDesktop\app-3.5.7\resources\app\git\cmd\git.exe"
& $git config --global user.name "khawale01"
& $git config --global user.email "khawale01@github.com"
& $git init
& $git add .
& $git commit -m "Medical Store System - Deployment Ready"
& $git branch -M main
& $git remote remove origin 2>$null
& $git remote add origin "https://github.com/khawale01/medicalstoresys.git"
Write-Host ""
Write-Host "============================================"
Write-Host "Now pushing to GitHub..."
Write-Host "When asked for password, use your GitHub Personal Access Token"
Write-Host "Get one at: https://github.com/settings/tokens"
Write-Host "============================================"
& $git push -u origin main
Write-Host ""
Write-Host "DONE! Check: https://github.com/khawale01/medicalstoresys"
pause
