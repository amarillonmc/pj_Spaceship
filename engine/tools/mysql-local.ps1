param([ValidateRange(1024,65535)][int]$Port = 3317)
$ErrorActionPreference = 'Stop'
$taskEngine = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskLocal = Join-Path $taskEngine '.local'
$taskVersion = '8.4.11'
$taskArchive = Join-Path $taskLocal "mysql-$taskVersion-winx64.zip"
$taskInstall = Join-Path $taskLocal "mysql-$taskVersion-winx64"
$taskData = Join-Path $taskLocal 'mysql-data'
$taskConfig = Join-Path $taskLocal 'my.ini'
$taskAdmin = Join-Path $taskLocal 'mysql-admin.cnf'
$taskBootstrap = Join-Path $taskLocal 'mysql-bootstrap.sql'
$taskPidFile = Join-Path $taskLocal 'mysql.pid'
$taskEnv = Join-Path $taskEngine '.env'
$taskExe = Join-Path $taskInstall 'bin/mysqld.exe'
$taskClient = Join-Path $taskInstall 'bin/mysql.exe'
$taskMetadata = Join-Path $taskLocal 'mysql-instance.json'
if ($Port -eq 3306) { throw 'Port 3306 is reserved for the existing MySQL installation. Choose a dedicated port.' }
New-Item -ItemType Directory -Force -Path $taskLocal | Out-Null

function New-TaskSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Test-TaskPort {
    $probe = New-Object Net.Sockets.TcpClient
    try { $probe.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $probe.Dispose() }
}

function Test-TaskDatabase {
    if (!(Test-Path -LiteralPath $taskClient) -or !(Test-Path -LiteralPath $taskAdmin)) { return $false }
    $answer = & $taskClient "--defaults-file=$taskAdmin" --no-login-paths --connect-timeout=3 --batch --skip-column-names '--execute=SELECT @@port, @@datadir;' 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    $parts = "$answer" -split "`t"
    if ($parts.Count -ne 2) { return $false }
    $actualData = [IO.Path]::GetFullPath($parts[1]).TrimEnd('\', '/')
    return ([int]$parts[0] -eq $Port -and $actualData -eq $taskData.TrimEnd('\', '/'))
}

if (Test-TaskPort) {
    if (Test-TaskDatabase) { Write-Host "Project MySQL already running at 127.0.0.1:$Port; data: $taskData"; exit 0 }
    throw "Port $Port is occupied by another process; nothing was changed."
}

if (!(Test-Path -LiteralPath $taskExe)) {
    if (!(Test-Path -LiteralPath $taskArchive)) {
        Write-Host "Downloading official MySQL $taskVersion portable archive into $taskLocal ..."
        Invoke-WebRequest -UseBasicParsing -Uri "https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-$taskVersion-winx64.zip" -OutFile $taskArchive
    }
    # Published by Oracle on https://dev.mysql.com/downloads/mysql/8.4.html.
    # HTTPS authenticates the source; the published MD5 detects archive damage.
    $actualHash = (Get-FileHash -LiteralPath $taskArchive -Algorithm MD5).Hash
    if ($actualHash -ne '2E833921898A9A030EA6BFE81BD811BC') { throw 'Archive checksum mismatch. No archive was extracted.' }
    & tar.exe -xf $taskArchive -C $taskLocal
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $taskExe)) { throw 'Portable MySQL extraction failed.' }
}

$taskNew = !(Test-Path -LiteralPath (Join-Path $taskData 'mysql'))
if ($taskNew) {
    if (Test-Path -LiteralPath $taskEnv) { throw 'engine/.env already exists while the project database is uninitialized. Preserve it and resolve configuration before initialization.' }
    $taskRootPassword = New-TaskSecret
    $taskAppPassword = New-TaskSecret
    @"
[client]
host=127.0.0.1
port=$Port
user=root
password=$taskRootPassword
protocol=TCP
"@ | Set-Content -LiteralPath $taskAdmin -Encoding ascii
    @"
MYSQL_HOST=127.0.0.1
MYSQL_PORT=$Port
MYSQL_USER=spaceship_app
MYSQL_PASSWORD=$taskAppPassword
MYSQL_DATABASE=spaceship_engine
HOST=127.0.0.1
PORT=8098
DEV_TOOLS=1
"@ | Set-Content -LiteralPath $taskEnv -Encoding ascii
    @"
ALTER USER 'root'@'localhost' IDENTIFIED BY '$taskRootPassword';
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '$taskRootPassword';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS spaceship_engine CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;
CREATE USER IF NOT EXISTS 'spaceship_app'@'127.0.0.1' IDENTIFIED BY '$taskAppPassword';
CREATE USER IF NOT EXISTS 'spaceship_app'@'localhost' IDENTIFIED BY '$taskAppPassword';
GRANT ALL PRIVILEGES ON spaceship_engine.* TO 'spaceship_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON spaceship_engine.* TO 'spaceship_app'@'localhost';
"@ | Set-Content -LiteralPath $taskBootstrap -Encoding ascii
}
if (!(Test-Path -LiteralPath $taskEnv) -or !(Test-Path -LiteralPath $taskAdmin)) { throw 'Project database credentials are missing. Existing data was preserved.' }

$taskBaseIni = $taskInstall.Replace('\', '/')
$taskDataIni = $taskData.Replace('\', '/')
$taskLogIni = (Join-Path $taskLocal 'mysql-error.log').Replace('\', '/')
$taskPidIni = $taskPidFile.Replace('\', '/')
@"
[mysqld]
basedir=$taskBaseIni
datadir=$taskDataIni
port=$Port
bind-address=127.0.0.1
mysqlx=0
skip-name-resolve
skip-log-bin
local-infile=0
character-set-server=utf8mb4
collation-server=utf8mb4_0900_as_cs
innodb-buffer-pool-size=64M
max-connections=40
log-error=$taskLogIni
pid-file=$taskPidIni
"@ | Set-Content -LiteralPath $taskConfig -Encoding ascii

if ($taskNew) {
    Write-Host "Initializing independent project data directory: $taskData"
    $initArgs = @("--defaults-file=`"$taskConfig`"", '--initialize-insecure')
    $initProcess = Start-Process -FilePath $taskExe -ArgumentList $initArgs -WindowStyle Hidden -PassThru -Wait
    if ($initProcess.ExitCode -ne 0) { throw "MySQL initialization failed (exit $($initProcess.ExitCode)); see $taskLogIni. Existing MySQL services were not changed." }
}

$taskArgs = @("--defaults-file=`"$taskConfig`"", '--no-monitor')
if (Test-Path -LiteralPath $taskBootstrap) { $taskArgs += "--init-file=`"$taskBootstrap`"" }
$taskProcess = Start-Process -FilePath $taskExe -ArgumentList $taskArgs -WindowStyle Hidden -PassThru
@{ version=$taskVersion; port=$Port; executable=$taskExe; dataDirectory=$taskData; processId=$taskProcess.Id } | ConvertTo-Json | Set-Content -LiteralPath $taskMetadata -Encoding ascii
$taskDeadline = (Get-Date).AddSeconds(45)
do {
    Start-Sleep -Milliseconds 300
    $taskProcess.Refresh()
    if ($taskProcess.HasExited) { throw "Project MySQL exited during startup; see $taskLogIni." }
    if ((Test-TaskPort) -and (Test-TaskDatabase)) {
        if (Test-Path -LiteralPath $taskBootstrap) { Remove-Item -LiteralPath $taskBootstrap }
        Write-Host "Project MySQL $taskVersion ready at 127.0.0.1:$Port."
        Write-Host "Data: $taskData"
        Write-Host "Credentials: $taskEnv (not displayed). No Windows service was registered."
        exit 0
    }
} while ((Get-Date) -lt $taskDeadline)
throw "Project MySQL did not become ready within 45 seconds; see $taskLogIni."
