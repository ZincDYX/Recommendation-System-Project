<#
.SYNOPSIS
Trains the lightweight recommenders for one or more datasets.

.DESCRIPTION
Runs popularity, ItemCF, and content-based TF-IDF training by default. Generated
model artifacts are written under the backend output directory and are ignored
by Git.

.EXAMPLE
.\backend\scripts\train_lightweight.ps1

.EXAMPLE
.\backend\scripts\train_lightweight.ps1 -Datasets MovieLens -Models popularity -MaxTrainRows 5000 -MaxUsers 100
#>

param(
    [string]$DataRoot,
    [string]$OutputDir,
    [double]$PositiveThreshold = 4.0,
    [int]$MovieLensItemcfHistory = 50,
    [int]$AmazonItemcfHistory = 50,
    [int]$ItemcfTopkNeighbors = 100,
    [int]$ItemcfUserRecentK = 30,
    [int]$ItemcfPairWindow = 50,
    [double]$ItemcfPairTauDays = 365.0,
    [double]$ItemcfUserTauDays = 180.0,
    [double]$ItemcfRatingPower = 1.0,
    [int]$ContentMaxFeatures = 30000,
    [int]$ContentMaxUserHistory = 50,
    [int]$Seed = 2026,
    [string[]]$Datasets = @("MovieLens", "Movies_and_TV"),
    [string[]]$Models = @("popularity", "itemcf", "content_tfidf"),
    [int]$MaxTrainRows = 0,
    [int]$MaxUsers = 0
)

$ErrorActionPreference = "Stop"

$BackendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DataRoot) {
    $DataRoot = Join-Path $BackendRoot "..\rec_data"
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $BackendRoot "saved_models"
}

function Invoke-LightweightTraining {
    param(
        [string]$DatasetName,
        [int]$ItemcfMaxUserHistory
    )

    $datasetDir = Join-Path $DataRoot $DatasetName
    $commandArgs = @(
        "-m", "src.train",
        "--data_dir", $datasetDir,
        "--output_dir", $OutputDir,
        "--models"
    )
    $commandArgs += $Models
    $commandArgs += @(
        "--positive_threshold", "$PositiveThreshold",
        "--seed", "$Seed",
        "--itemcf_max_user_history", "$ItemcfMaxUserHistory",
        "--itemcf_topk_neighbors", "$ItemcfTopkNeighbors",
        "--itemcf_user_recent_k", "$ItemcfUserRecentK",
        "--itemcf_pair_window", "$ItemcfPairWindow",
        "--itemcf_pair_tau_days", "$ItemcfPairTauDays",
        "--itemcf_user_tau_days", "$ItemcfUserTauDays",
        "--itemcf_rating_power", "$ItemcfRatingPower",
        "--content_max_features", "$ContentMaxFeatures",
        "--content_max_user_history", "$ContentMaxUserHistory"
    )

    if ($MaxTrainRows -gt 0) {
        $commandArgs += @("--max_train_rows", "$MaxTrainRows")
    }
    if ($MaxUsers -gt 0) {
        $commandArgs += @("--max_users", "$MaxUsers")
    }

    Write-Host "Training lightweight models for $DatasetName"
    python @commandArgs
}

Push-Location $BackendRoot
try {
    foreach ($dataset in $Datasets) {
        $historyLimit = if ($dataset -eq "Movies_and_TV") { $AmazonItemcfHistory } else { $MovieLensItemcfHistory }
        Invoke-LightweightTraining -DatasetName $dataset -ItemcfMaxUserHistory $historyLimit
    }
}
finally {
    Pop-Location
}
