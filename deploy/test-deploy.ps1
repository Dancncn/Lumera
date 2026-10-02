# Verify the actual native-command helper without invoking a deployment or SSH.
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$source = Join-Path $PSScriptRoot '../scripts/deploy.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$helper = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Checked' }, $true)
if (-not $helper) { throw 'Missing native-command helper' }
. ([scriptblock]::Create($helper.Extent.Text))
Invoke-Checked 'cmd.exe' @('/d', '/c', 'exit 0')
$failed = $false
try { Invoke-Checked 'cmd.exe' @('/d', '/c', 'exit 7') } catch { $failed = $_.Exception.Message -match 'exit 7' }
if (-not $failed) { throw 'A failing native command was incorrectly accepted' }
# GitHub's pwsh wrapper propagates the last native exit code after the script ends.
Invoke-Checked 'cmd.exe' @('/d', '/c', 'exit 0')
Write-Output 'PASS: PowerShell deployment parses and native-command failures terminate the operation.'
