# Run this in PowerShell from C:\Users\chilw\Documents\blockchain
# Right-click PowerShell → Run as Administrator is NOT needed

Set-Location $PSScriptRoot

Write-Host "Removing any existing broken .git directory..." -ForegroundColor Yellow
if (Test-Path ".git") { Remove-Item -Recurse -Force ".git" }

Write-Host "Initialising git repository..." -ForegroundColor Yellow
git init -b main

Write-Host "Configuring git identity..." -ForegroundColor Yellow
git config user.name "Owen"
git config user.email "chilwaloowen130@gmail.com"

Write-Host "Adding remote..." -ForegroundColor Yellow
git remote add origin https://github.com/OWENATOR-3000/maritime-consortium.git

Write-Host "Staging all project files (documents excluded via .gitignore)..." -ForegroundColor Yellow
git add .

Write-Host "Creating initial commit..." -ForegroundColor Yellow
git commit -m "Initial commit: Maritime Consortium Blockchain Platform

- Hyperledger Fabric 2.5 network (5 orgs, RAFT consensus)
- Smart contract: maritime-consortium-contract.js
- REST API gateway (port 8080)
- Private data collections for ShipA commercial data
- Multi-party clearance workflow (ShipA + Customs + Port)
- Document hash anchoring & tamper detection
- 14-step CLI test suite with negative tests
- Docker network scripts (start.sh / stop.sh)"

Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host "Done! Check https://github.com/OWENATOR-3000/maritime-consortium" -ForegroundColor Green
