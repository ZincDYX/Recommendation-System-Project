<#
.SYNOPSIS
Runs batched offline evaluation for trained recommenders.

.DESCRIPTION
Evaluates one or more datasets across multiple positive-label definitions and
negative-sampling sizes. CSV outputs are written under the backend results
directory and are ignored by Git.

.EXAMPLE
.\backend\scripts\evaluate_recommenders.ps1

.EXAMPLE
.\backend\scripts\evaluate_recommenders.ps1 -Datasets MovieLens -Models popularity -NegativeCounts 20 -PositiveThresholds 0 -MaxEvalUsers 100 -NoEnsemble
#>

param(
    [string]$DataRoot,
    [string]$ModelRoot,
    [string]$ResultsDir,
    [string[]]$Datasets = @("MovieLens", "Movies_and_TV"),
    [string[]]$Models = @("popularity", "itemcf", "content_tfidf", "bpr_mf", "gru4rec"),
    [int[]]$KValues = @(5, 10, 20),
    [int[]]$NegativeCounts = @(100, 1000),
    [double[]]$PositiveThresholds = @(0.0, 4.0),
    [int]$MaxEvalUsers = 0,
    [int]$Seed = 2026,
    [switch]$NoEnsemble,
    [string]$EnsembleWeights = ""
)

$ErrorActionPreference = "Stop"

$CallerRoot = Get-Location
$BackendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Resolve-PathArgument {
    param(
        [string]$PathValue,
        [string]$BasePath
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

if (-not $DataRoot) {
    $DataRoot = Join-Path $BackendRoot "..\rec_data"
}
else {
    $DataRoot = Resolve-PathArgument -PathValue $DataRoot -BasePath $CallerRoot
}
if (-not $ModelRoot) {
    $ModelRoot = Join-Path $BackendRoot "saved_models"
}
else {
    $ModelRoot = Resolve-PathArgument -PathValue $ModelRoot -BasePath $CallerRoot
}
if (-not $ResultsDir) {
    $ResultsDir = Join-Path $BackendRoot "results"
}
else {
    $ResultsDir = Resolve-PathArgument -PathValue $ResultsDir -BasePath $CallerRoot
}

function Get-ThresholdLabel {
    param([double]$Threshold)

    if ($Threshold -le 0) {
        return "all"
    }
    return "pos$($Threshold.ToString('0.##').Replace('.', 'p'))"
}

function Invoke-RecommenderEvaluation {
    param(
        [string]$DatasetName,
        [int]$NegativeCount,
        [double]$PositiveThreshold
    )

    $datasetDir = Join-Path $DataRoot $DatasetName
    $modelDir = Join-Path $ModelRoot $DatasetName
    $thresholdLabel = Get-ThresholdLabel -Threshold $PositiveThreshold
    $outputPath = Join-Path $ResultsDir "$($DatasetName.ToLower())_$($thresholdLabel)_n$NegativeCount.csv"

    $commandArgs = @(
        "-m", "src.evaluate",
        "--data_dir", $datasetDir,
        "--model_dir", $modelDir,
        "--models"
    )
    $commandArgs += $Models
    $commandArgs += @(
        "--ks"
    )
    $commandArgs += $KValues
    $commandArgs += @(
        "--num_negatives", "$NegativeCount",
        "--positive_threshold", "$PositiveThreshold",
        "--output", $outputPath,
        "--seed", "$Seed"
    )

    if ($MaxEvalUsers -gt 0) {
        $commandArgs += @("--max_eval_users", "$MaxEvalUsers")
    }
    if (-not $NoEnsemble) {
        $commandArgs += "--include_ensemble"
    }
    if ($EnsembleWeights) {
        $commandArgs += @("--ensemble_weights", $EnsembleWeights)
    }

    Write-Host "Evaluating $DatasetName threshold=$PositiveThreshold negatives=$NegativeCount"
    python @commandArgs
}

Push-Location $BackendRoot
try {
    New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
    foreach ($dataset in $Datasets) {
        foreach ($threshold in $PositiveThresholds) {
            foreach ($negativeCount in $NegativeCounts) {
                Invoke-RecommenderEvaluation -DatasetName $dataset -NegativeCount $negativeCount -PositiveThreshold $threshold
            }
        }
    }
}
finally {
    Pop-Location
}
