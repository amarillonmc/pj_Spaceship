$ErrorActionPreference = 'Stop'
$taskEngine = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskLocal = Join-Path $taskEngine '.local'
$taskMetadata = Join-Path $taskLocal 'mysql-instance.json'
$taskAdmin = Join-Path $taskLocal 'mysql-admin.cnf'
if (!(Test-Path -LiteralPath $taskMetadata)) { Write-Host 'No project MySQL instance is registered locally.'; exit 0 }
$taskInstance = Get-Content -Raw -LiteralPath $taskMetadata | ConvertFrom-Json
$taskExpectedExe = [IO.Path]::GetFullPath($taskInstance.executable)
$taskExpectedData = [IO.Path]::GetFullPath((Join-Path $taskLocal 'mysql-data')).TrimEnd('\', '/')
if (!$taskExpectedExe.StartsWith($taskLocal + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to stop a database outside this project.' }
if ([IO.Path]::GetFullPath($taskInstance.dataDirectory).TrimEnd('\', '/') -ne $taskExpectedData) { throw 'Unexpected data directory; no process was stopped.' }
$taskProcess = Get-Process -Id $taskInstance.processId -ErrorAction SilentlyContinue
if (!$taskProcess) { Write-Host 'Project MySQL is already stopped.'; exit 0 }
if ([IO.Path]::GetFullPath($taskProcess.Path) -ne $taskExpectedExe) { throw 'PID belongs to another executable; no process was stopped.' }
$taskClient = Join-Path (Split-Path $taskExpectedExe) 'mysql.exe'
$taskMysqlAdmin = Join-Path (Split-Path $taskExpectedExe) 'mysqladmin.exe'
$taskAnswer = & $taskClient "--defaults-file=$taskAdmin" --no-login-paths --batch --skip-column-names '--execute=SELECT @@datadir;' 2>$null
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath("$taskAnswer").TrimEnd('\', '/') -ne $taskExpectedData) { throw 'Could not verify the dedicated project database. No process was stopped.' }
& $taskMysqlAdmin "--defaults-file=$taskAdmin" --no-login-paths shutdown
if ($LASTEXITCODE -ne 0) { throw 'Graceful shutdown failed. No other process was touched.' }
Write-Host "Stopped only the project database at 127.0.0.1:$($taskInstance.port); data was preserved."
