# 个性化推荐系统项目报告

## 1. GitHub 链接与提交内容确认

GitHub 仓库链接：https://github.com/ZincDYX/Recommendation-System-Project

仓库已经包含 `README.md`。README 中说明了项目代码架构、数据目录约定、训练方法、评测方法、融合调参方法、FastAPI 后端启动方法和 React 前端启动方法。

当前本地 Git 索引检查结果：

- `README.md` 和 `.gitignore` 已被 Git 跟踪。
- `rec_data/`、`saved_models/`、`saved_models*/`、`results/`、`results*/`、`backend/cache/`、`*.pkl` 等数据集、模型文件、中间结果和缓存文件已写入 `.gitignore`。
- 执行 `git ls-files rec_data backend/results backend/saved_models saved_models results` 时没有返回任何文件，说明当前本地仓库没有跟踪这些数据集文件、中间结果文件或模型文件。

我能确认的是当前本地 Git 索引和 `.gitignore` 状态；如果远端 GitHub 仓库之后被其他人手动上传过大文件，需要再以 GitHub 页面或 `git ls-tree origin/main` 的结果为准。

## 2. 系统架构与数据处理

整体架构分为后端推荐模块和前端展示模块：

| 模块 | 作用 |
|---|---|
| `backend/src/data.py` | 读取 `train.txt`、`valid.txt`、`test.txt`、`info.jsonl`，按时间戳整理用户历史行为 |
| `backend/src/models/` | 实现 Popularity、ItemCF、Content-TFIDF、BPR-MF、GRU4Rec、Weighted Ensemble |
| `backend/src/train.py` | 训练各个推荐算法并保存模型 |
| `backend/src/evaluate.py` | 使用 sampled leave-one-out 协议计算 Hit、Precision、Recall、NDCG、MRR |
| `backend/src/tune_ensemble.py` | 自动搜索融合模型权重，并把每组权重和指标写入 CSV |
| `backend/src/api_server.py` | 提供数据集、用户、历史行为、推荐结果、指标和商品详情 API |
| `frontend/src/` | React 前端，包含 Store、Experiment、Login/Profile 等展示页面 |

数据文件格式为：

```text
<user_id> <item_id> <rating> <timestamp>
```

处理方式：

- `train.txt` 用于训练模型。
- `valid.txt` 用于过滤用户已经看过或交互过的物品。
- `test.txt` 用于离线评测。
- `info.jsonl` 用于读取物品标题。
- 训练和评测时默认把 `rating >= 4.0` 当作正反馈。
- 评测采用 sampled leave-one-out：每个测试正例和 100 个随机负例一起排序，观察正例是否排进 Top-K。

## 3. 算法实现与选择理由

所有算法都实现同一套接口：`fit()` 负责训练，`score_items()` 负责给候选物品打分，`recommend()` 负责排序并返回 Top-K。这样后端 API 和评测脚本可以用统一方式调用不同算法。

| 算法 | 实现方式 | 选择理由 |
|---|---|---|
| `popularity` | 统计训练集中每个物品的加权交互分数，分数越高越优先推荐。当前默认不启用时间衰减，但代码支持配置 half-life。 | 经典强基线，用来判断个性化算法是否真正超过热门推荐。 |
| `itemcf` | 根据用户共同喜欢的物品构建 item-item 共现矩阵，再用类似余弦归一化的方式得到物品相似度。推荐时根据用户近期高分历史物品累加相似物品得分。 | 经典协同过滤算法，能利用“看过相似电影的人也看过什么”。 |
| `content_tfidf` | 对 `info.jsonl` 中的物品标题做 TF-IDF 向量化，用用户近期高分物品标题向量加权形成用户画像，再用点积相似度给候选物品打分。 | 内容推荐基线，能使用商品语义信息；但目前语义主要来自标题，不是完整剧情文本。 |
| `bpr_mf` | 使用 PyTorch 训练用户向量和物品向量，优化 BPR pairwise ranking loss，使用户正样本分数高于负样本。 | BPR-MF 是 Top-N 推荐中常用的矩阵分解方法，适合隐式反馈和排序任务。 |
| `gru4rec` | 使用物品 embedding + GRU，根据用户按时间排序的正反馈序列预测下一步可能喜欢的物品。 | 这是基于神经网络的序列推荐算法，能显式利用交互时序信息。 |
| `ensemble` | 对多个基础模型在同一候选集上的分数做 min-max 归一化，再按权重加权求和排序。 | 融合热门度、协同过滤、内容相似、矩阵分解和序列模型，通常比单一模型更稳。 |

说明：不同算法的原始 score 含义不同，不能直接横向比较。例如 `popularity` 的 score 是热门度累计值，`bpr_mf` 的 score 是矩阵分解预测偏好，`ensemble` 的 score 是归一化后的加权融合分。

## 4. 算法推荐 Case

下面 case 使用同一个用户 ID 分别输入所有算法，展示各算法 Top-3 推荐结果。case 结果来自当前本地 `backend/saved_models/` 中的已训练模型。运行时本地 Python 对 `content_tfidf` 的 pickle 加载给出过 scikit-learn 版本不一致警告，因此如果换环境重新加载，`content_tfidf` 的个别浮点分数可能略有不同；离线指标表以 `backend/results/*.csv` 为准。

### Case A：MovieLens，用户 ID = `49305`

该用户本地训练/验证历史记录数为 7487。

| 算法 | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| `ensemble` | Interstellar (2014), score 0.5962 | The Imitation Game (2014), score 0.5719 | Human Condition II, The (1959), score 0.5669 |
| `popularity` | Interstellar (2014), score 37385.5000 | The Martian (2015), score 27292.0000 | Wolf of Wall Street, The (2013), score 25889.0000 |
| `itemcf` | Familiar Ground (2011), score 0.8410 | The Sky Turns (2004), score 0.8410 | The Little Girl Who Was Too Fond of Matches (2017), score 0.8410 |
| `content_tfidf` | Almost You (1985), score 6.7317 | Always (1985), score 6.7317 | Thrust in Me (1985), score 6.7317 |
| `bpr_mf` | Interstellar (2014), score 11.7004 | The Imitation Game (2014), score 10.6418 | The Martian (2015), score 10.3594 |
| `gru4rec` | Looper (2012), score 1.4813 | Silver Linings Playbook (2012), score 1.4619 | Black Panther (2017), score 1.4402 |

### Case B：Movies_and_TV，用户 ID = `A328S9RN3U5M68`

该用户本地训练/验证历史记录数为 2061。

| 算法 | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| `ensemble` | X-Men - Apocalypse - The Cure/Come The Apocalypse VHS, score 0.7862 | The Finest Hours, score 0.7809 | Batman v Superman: Dawn of Justice, score 0.7687 |
| `popularity` | Guardians of the Galaxy, score 33242.0000 | John Adams, score 26010.0000 | Guardians Of The Galaxy Region Free, score 25426.0000 |
| `itemcf` | The Finest Hours, score 0.4222 | Truman [Non-usa Format: Pal -Import- Spain], score 0.3648 | X-Men - Apocalypse - The Cure/Come The Apocalypse VHS, score 0.3494 |
| `content_tfidf` | The Appearing Digital, score 9.9381 | Tapped Out Digital, score 9.9381 | Sector 4: Extraction Digital, score 9.9381 |
| `bpr_mf` | The Hunger Games: Catching Fire 2013, score 8.9492 | Star Trek Into Darkness, score 8.8680 | The Hobbit: An Unexpected Journey, score 8.7499 |
| `gru4rec` | Guardians Of The Galaxy Region Free, score 2.3622 | Last of the Summer Wine: Vintage 1976, score 2.3318 | American Sniper 2014, score 2.2886 |

## 5. 评测指标说明

本项目主表使用 `K=10`、`positive_threshold=4.0`、`num_negatives=100` 的 sampled ranking 结果。

| 指标 | 含义 |
|---|---|
| Hit@10 | 测试正例是否出现在 Top-10 中。出现为 1，否则为 0，最后对所有测试 case 求平均。 |
| Precision@10 | Top-10 中相关物品比例。本评测每个 case 只有 1 个测试正例，所以 Precision@10 的理论最大值是 0.1。 |
| Recall@10 | 相关物品被召回的比例。本评测每个 case 只有 1 个测试正例，所以 Recall@10 与 Hit@10 数值相同。 |
| NDCG@10 | 考虑正例排名位置的排序质量指标，正例越靠前分数越高。 |
| MRR@10 | 第一个相关物品排名倒数的平均值，越靠前越高。 |

## 6. 整体指标对比

### MovieLens：`pos4`，100 negatives，K=10

| 算法 | Hit@10 | Precision@10 | Recall@10 | NDCG@10 | MRR@10 |
|---|---:|---:|---:|---:|---:|
| `ensemble` | 0.9711 | 0.0971 | 0.9711 | 0.8161 | 0.7654 |
| `gru4rec` | 0.9614 | 0.0961 | 0.9614 | 0.7556 | 0.6890 |
| `bpr_mf` | 0.9602 | 0.0960 | 0.9602 | 0.7538 | 0.6869 |
| `popularity` | 0.9656 | 0.0966 | 0.9656 | 0.7532 | 0.6844 |
| `itemcf` | 0.7649 | 0.0765 | 0.7649 | 0.7023 | 0.6812 |
| `content_tfidf` | 0.3873 | 0.0387 | 0.3873 | 0.2159 | 0.1634 |

结论：MovieLens 上 `ensemble` 的 NDCG@10 和 MRR@10 最高，说明融合后不仅命中率高，而且正例位置更靠前。`content_tfidf` 明显较低，主要原因是当前内容特征主要来自标题，信息量有限。

### Movies_and_TV：`pos4`，100 negatives，K=10

| 算法 | Hit@10 | Precision@10 | Recall@10 | NDCG@10 | MRR@10 |
|---|---:|---:|---:|---:|---:|
| `ensemble` | 0.8407 | 0.0841 | 0.8407 | 0.6229 | 0.5542 |
| `popularity` | 0.8058 | 0.0806 | 0.8058 | 0.5655 | 0.4901 |
| `bpr_mf` | 0.7968 | 0.0797 | 0.7968 | 0.5617 | 0.4880 |
| `gru4rec` | 0.7906 | 0.0791 | 0.7906 | 0.5563 | 0.4828 |
| `itemcf` | 0.3324 | 0.0332 | 0.3324 | 0.2819 | 0.2666 |
| `content_tfidf` | 0.2742 | 0.0274 | 0.2742 | 0.1931 | 0.1683 |

结论：Movies_and_TV 上 `ensemble` 仍然最好，但整体分数低于 MovieLens。一个可能原因是该数据集物品更多、长尾更明显，且标题内容噪声更大；我不能完全确定这是唯一原因，因为需要进一步分析用户分布、物品分布和负采样结果。

## 7. 融合调参结果

调参对象是 `ensemble`。调参脚本 `backend/src/tune_ensemble.py` 会读取已经训练好的基础模型，枚举不同权重组合，按目标指标排序，并把结果写入 CSV。

调参设置：

| 参数 | 值 |
|---|---|
| Target metric | `NDCG@10` |
| Positive threshold | `4.0` |
| Negative samples | `100` |
| Max eval users | `1000` |
| Seed | `2026` |
| Grid step | `0.2` |

最终权重来自调参 CSV 中 `rank = 1` 且 `k = 10` 的记录：

| 数据集 | 最终权重 | 调参目标分数 |
|---|---|---:|
| MovieLens | `popularity=0,itemcf=0.2,content_tfidf=0.2,bpr_mf=0.2,gru4rec=0.4` | 0.8347 |
| Movies_and_TV | `popularity=0,itemcf=0.4,content_tfidf=0,bpr_mf=0.4,gru4rec=0.2` | 0.6206 |

对应的最终权重文件内容可以概括为：

```text
backend/results/tuning/movielens_pos4_n100_ndcg10_20260604_024041.csv
dataset=MovieLens
models=popularity itemcf content_tfidf bpr_mf gru4rec
weights=popularity=0,itemcf=0.2,content_tfidf=0.2,bpr_mf=0.2,gru4rec=0.4
target_metric=ndcg
target_k=10
target_score=0.8347327553820606
num_negatives=100
positive_threshold=4.0
max_eval_users=1000
seed=2026
grid_step=0.2

backend/results/tuning/movies_and_tv_pos4_n100_ndcg10_20260604_111126.csv
dataset=Movies_and_TV
models=popularity itemcf content_tfidf bpr_mf gru4rec
weights=popularity=0,itemcf=0.4,content_tfidf=0,bpr_mf=0.4,gru4rec=0.2
target_metric=ndcg
target_k=10
target_score=0.6205517756487793
num_negatives=100
positive_threshold=4.0
max_eval_users=1000
seed=2026
grid_step=0.2
```

注意：当前 API 的 `ensemble` 支持通过 `weights` 参数传入上述权重；如果不传权重，后端会使用等权融合。

## 8. 分工

| 成员 | 分工 |
|---|---|
| 我 | 推荐算法实现；训练、评测、调参脚本实现；最终前后端联调和功能修改。 |
| 队友 | 前端 UI 实现；前端与后端数据衔接的 API 设计。 |

