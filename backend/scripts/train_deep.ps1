<#
.SYNOPSIS
Trains BPR-MF and GRU4Rec models for one or more datasets.

.DESCRIPTION
Runs the neural and matrix-factorization recommenders with medium default
hyperparameters. Generated model artifacts are written under the backend output
directory and are ignored by Git.

.EXAMPLE
.\backend\scripts\train_deep.ps1

.EXAMPLE
.\backend\scripts\train_deep.ps1 -Datasets MovieLens -Models bpr_mf -Epochs 1 -MaxTrainSamples 10000 -MaxTrainRows 50000 -MaxUsers 1000
#>

param(
    [string]$DataRoot,
    [string]$OutputDir,
    [double]$PositiveThreshold = 4.0,
    [int]$Factors = 64,
    [int]$HiddenDim = 64,
    [int]$MovieLensMaxSeqLen = 50,
    [int]$AmazonMaxSeqLen = 20,
    [int]$Epochs = 3,
    [int]$BatchSize = 1024,
    [double]$LearningRate = 0.001,
    [int]$MaxTrainSamples = 500000,
    [string]$Device = "cpu",
    [int]$Seed = 2026,
    [string[]]$Datasets = @("MovieLens", "Movies_and_TV"),
    [string[]]$Models = @("bpr_mf", "gru4rec"),
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

function Invoke-DeepTraining {
    param(
        [string]$DatasetName,
        [int]$MaxSeqLen
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
        "--factors", "$Factors",
        "--hidden_dim", "$HiddenDim",
        "--max_seq_len", "$MaxSeqLen",
        "--epochs", "$Epochs",
        "--batch_size", "$BatchSize",
        "--lr", "$LearningRate",
        "--max_train_samples", "$MaxTrainSamples",
        "--device", "$Device"
    )

    if ($MaxTrainRows -gt 0) {
        $commandArgs += @("--max_train_rows", "$MaxTrainRows")
    }
    if ($MaxUsers -gt 0) {
        $commandArgs += @("--max_users", "$MaxUsers")
    }

    Write-Host "Training deep models for $DatasetName"
    python @commandArgs
}

Push-Location $BackendRoot
try {
    foreach ($dataset in $Datasets) {
        $seqLen = if ($dataset -eq "Movies_and_TV") { $AmazonMaxSeqLen } else { $MovieLensMaxSeqLen }
        Invoke-DeepTraining -DatasetName $dataset -MaxSeqLen $seqLen
    }
}
finally {
    Pop-Location
}
