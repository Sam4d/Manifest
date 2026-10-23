$ErrorActionPreference = 'Stop'
$version = '3.50.5'
$archive = Join-Path $env:RUNNER_TEMP "httrack-$version.tar.gz"
Invoke-WebRequest "https://deb.debian.org/debian/pool/main/h/httrack/httrack_$version.orig.tar.gz" -OutFile $archive
$expected = '491df91a3093f121bddf416bae915488643346adaebc2e1224a8acd144193f5e'
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'HTTrack source checksum mismatch' }
$buildRoot = Join-Path $env:RUNNER_TEMP 'pagetrace-httrack-build'
New-Item -ItemType Directory -Force $buildRoot | Out-Null
tar -xzf $archive -C $buildRoot
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
$source = Join-Path $buildRoot "httrack-$version"
& "$env:VCPKG_INSTALLATION_ROOT\vcpkg.exe" integrate install
if ($LASTEXITCODE -ne 0) { throw 'vcpkg integration failed' }
msbuild "$source\src\httrack.vcxproj" /m /p:Configuration=Release /p:Platform=x64 /p:VcpkgEnabled=true
if ($LASTEXITCODE -ne 0) { throw 'HTTrack source build failed' }
$destination = Join-Path $PSScriptRoot '..\vendor\httrack'
New-Item -ItemType Directory -Force $destination | Out-Null
Copy-Item "$source\src\x64\Release\httrack.exe" $destination
Copy-Item "$source\src\x64\Release\*.dll" $destination
Copy-Item $archive "$destination\httrack-$version-source.tar.gz"
Copy-Item "$source\COPYING" "$destination\COPYING.txt"
Copy-Item "$PSScriptRoot\build-httrack.ps1" "$destination\BUILD.ps1"
$installed = Join-Path $source 'src\vcpkg_installed\x64-windows'
if (Test-Path "$installed\bin") { Copy-Item "$installed\bin\*.dll" $destination }
if (Test-Path "$installed\share") { Copy-Item "$installed\share" "$destination\dependency-notices" -Recurse }
# Deploy the redistributable CRT alongside the CLI, rather than require an installer.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -property installationPath
$crt = Get-ChildItem "$vs\VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT" -Directory | Sort-Object FullName | Select-Object -Last 1
if (!$crt) { throw 'Visual C++ redistributable directory missing' }
Copy-Item "$($crt.FullName)\*.dll" $destination
& "$destination\httrack.exe" --version
if ($LASTEXITCODE -ne 0) { throw 'Built HTTrack does not launch' }
