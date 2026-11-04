# Corre la geocodificación (o la importación de la API del Registro) en segundo plano y muestra el avance
# en vivo en esta ventana.
#
# El script corre oculto y escribe en datos/geocodificacion/registro-<script>.log; la ventana solo muestra
# ese archivo. Así nada de lo que pase en la ventana lo frena: en la consola de Windows, un clic (modo
# "Seleccionar"), una selección o la tecla Pausa bloquean al programa que escribe en ella. Se puede cerrar
# la ventana y el proceso sigue; para volver a mirarlo, abrir el .log o correr de nuevo con -Ver.
#
# Uso (desde la raíz del repo):
#   powershell -ExecutionPolicy Bypass -File scripts\geocodificar-en-ventana.ps1 [argumentos del script]
#     p. ej.: ... geocodificar-en-ventana.ps1 --tipo todos --aplicar
#   Con -Script corre otro script, p. ej. la importación de la API del Registro:
#     ... geocodificar-en-ventana.ps1 -Script importar-api-proveedores.mjs
#   Solo mirar una corrida en curso:  ... geocodificar-en-ventana.ps1 -Script importar-api-proveedores.mjs -Ver
param(
  [string] $Script = "geocodificar-domicilios.mjs",
  [switch] $Ver,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]] $Argumentos
)

chcp 65001 > $null
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = 'Geocodificación de proveedores'

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$nombre = [IO.Path]::GetFileNameWithoutExtension($Script)
$registro = Join-Path $raiz "datos\geocodificacion\registro-$nombre.log"
New-Item -ItemType Directory -Force (Split-Path $registro) | Out-Null

if (-not $Ver) {
  if (-not $Argumentos -and $Script -eq 'geocodificar-domicilios.mjs') { $Argumentos = @('--tipo', 'todos') }
  # cmd hace la redirección; el proceso no tiene ventana ni consola compartida con esta
  $linea = "node scripts/$Script $($Argumentos -join ' ') > `"$registro`" 2>&1"
  $proceso = Start-Process cmd -ArgumentList '/c', $linea -WorkingDirectory $raiz -WindowStyle Hidden -PassThru
  Write-Host "Corriendo scripts/$Script en segundo plano (proceso $($proceso.Id))."
  Write-Host "Registro: $registro"
  Write-Host "Se puede cerrar esta ventana: el proceso sigue.`n"
  Start-Sleep -Seconds 2
}

# Muestra el registro a medida que crece, hasta que termine el proceso
Get-Content $registro -Wait -Tail 40 -Encoding UTF8
