# Personalized Recommendation System

这是“个性化推荐系统”大作业的初版代码框架，包含数据读取、多个推荐算法、Top-N 评测、命令行推荐和 Streamlit UI。
代码默认支持 sampled leave-one-out，并允许用 `--positive_threshold` 切换“所有测试交互”与“高分正例”两种设置。

## 已实现算法

- `popularity`：热门/时间衰减热门 baseline。
- `itemcf`：基于物品的协同过滤。
- `content_tfidf`：使用 `info.jsonl` 中商品标题的 TF-IDF 内容推荐。
- `bpr_mf`：BPR 矩阵分解，面向 Top-N 推荐。
- `gru4rec`：基于 GRU 的时序 next-item 推荐。
- `ensemble`：评测或 UI 中可选的多模型归一化加权融合。

## 数据目录

数据不提交到 GitHub。默认目录形如：

```text
rec_data/
  MovieLens/
    train.txt
    valid.txt
    test.txt
    info.jsonl
  Movies_and_TV/
    train.txt
    valid.txt
    test.txt
    info.jsonl
```

交互文件格式：

```text
<user_id> <item_id> <rating> <timestamp>
```

## 安装

```bash
cd backend
pip install -r requirements.txt
```

## 快速开发训练

先用小样本检查流程：

```bash
cd backend
python -m src.train --data_dir ../rec_data/MovieLens --max_train_rows 200000 --max_users 5000 --epochs 1 --max_train_samples 50000
```

完整训练时去掉 `--max_train_rows` 和 `--max_users`，并按机器性能调整 `--epochs`、`--max_train_samples`。

只训练轻量模型：

```bash
cd backend
python -m src.train --data_dir ../rec_data/MovieLens --models popularity itemcf content_tfidf
```

一键训练两个数据集的轻量模型：

```powershell
.\backend\scripts\train_lightweight.ps1
```

脚本也支持小样本检查：

```powershell
.\backend\scripts\train_lightweight.ps1 -Datasets MovieLens -Models popularity -MaxTrainRows 5000 -MaxUsers 100
```

一键训练两个数据集的矩阵分解和深度模型：

```powershell
.\backend\scripts\train_deep.ps1
```

深度模型脚本也支持小样本检查：

```powershell
.\backend\scripts\train_deep.ps1 -Datasets MovieLens -Models bpr_mf -Epochs 1 -MaxTrainSamples 10000 -MaxTrainRows 50000 -MaxUsers 1000
```

训练全套模型：

```bash
cd backend
python -m src.train --data_dir ../rec_data/MovieLens --models popularity itemcf content_tfidf bpr_mf gru4rec
python -m src.train --data_dir ../rec_data/Movies_and_TV --models popularity itemcf content_tfidf bpr_mf gru4rec
```

## 评测

默认每个测试正例采样 100 个负例，报告 `HitRate/Recall`、`Precision`、`NDCG`、`MRR`。

```bash
cd backend
python -m src.evaluate --data_dir ../rec_data/MovieLens --model_dir saved_models/MovieLens --include_ensemble --output results/movielens_metrics.csv
```

指定融合模型权重：

```bash
cd backend
python -m src.evaluate --data_dir ../rec_data/MovieLens --model_dir saved_models/MovieLens --include_ensemble --ensemble_weights popularity=0.15,itemcf=0.25,content_tfidf=0.10,bpr_mf=0.25,gru4rec=0.25 --output results/movielens_weighted_metrics.csv
```

只评测高分正例：

```bash
cd backend
python -m src.evaluate --data_dir ../rec_data/MovieLens --model_dir saved_models/MovieLens --positive_threshold 4.0 --include_ensemble
```

开发时限制评测用户数：

```bash
cd backend
python -m src.evaluate --data_dir ../rec_data/MovieLens --model_dir saved_models/MovieLens --max_eval_users 1000
```

## 单用户推荐

```bash
cd backend
python -m src.recommend --data_dir ../rec_data/MovieLens --model_dir saved_models/MovieLens --model itemcf --user_id 1 --topk 10
```

## UI

```bash
cd backend
streamlit run app.py
```

在侧边栏选择数据目录和模型目录，然后输入用户 ID 查看训练历史与推荐结果。
