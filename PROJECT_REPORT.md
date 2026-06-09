# 个性化推荐系统项目报告

## 1. GitHub 链接与提交内容确认

GitHub 仓库链接：https://github.com/ZincDYX/Recommendation-System-Project

仓库包含了数据集和生成结果之外的所有代码文件。README 中说明了项目代码架构、数据目录约定、训练方法、评测方法、融合调参方法、FastAPI 后端启动方法和 React 前端启动方法。

当前本地 Git 索引确认：`README.md` 和 `.gitignore` 已被跟踪；`rec_data/`、`saved_models*/`、`results*/`、`backend/cache/`、`*.pkl` 等数据集、模型、中间结果和缓存文件已写入 `.gitignore`；`git ls-files rec_data backend/results backend/saved_models saved_models results` 没有返回文件。因此我能确认当前本地仓库没有提交这些数据集文件和中间结果文件；远端是否被其他人手动上传过，仍需以 GitHub 页面或远端 Git 树为准。

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
- 深度模型训练在实验室服务器 GPU 环境中完成。

## 3. 算法实现与选择理由

所有算法都实现同一套接口：`fit()` 负责训练，`score_items()` 负责给候选物品打分，`recommend()` 负责排序并返回 Top-K。这样后端 API 和评测脚本可以用统一方式调用不同算法。

| 算法 | 实现方式 | 选择理由 |
|---|---|---|
| `popularity` | 统计训练集中每个物品的加权交互分数，分数越高越优先推荐。当前默认不启用时间衰减，但代码支持配置 half-life。 | 经典强基线，用来判断个性化算法是否真正超过热门推荐。 |
| `itemcf` | 在传统 ItemCF 上改写为 Time-aware Rating-weighted ItemCF：共现强度同时考虑评分强度、交互时间间隔、用户长历史降权和近期兴趣衰减。 | 保留协同过滤可解释性，同时比纯共现 ItemCF 更能反映用户真实兴趣强度和时间变化。 |
| `content_tfidf` | 对 `info.jsonl` 中的物品标题做 TF-IDF 向量化，用用户近期高分物品标题向量加权形成用户画像，再用点积相似度给候选物品打分。 | 内容推荐基线，能使用商品语义信息；但目前语义主要来自标题，不是完整剧情文本。 |
| `bpr_mf` | 使用 PyTorch 训练用户向量和物品向量，优化 BPR pairwise ranking loss，使用户正样本分数高于负样本。 | BPR-MF 是 Top-N 推荐中常用的矩阵分解方法，适合隐式反馈和排序任务。 |
| `gru4rec` | 使用物品 embedding + GRU，根据用户按时间排序的正反馈序列预测下一步可能喜欢的物品。 | 这是基于神经网络的序列推荐算法，能显式利用交互时序信息。 |
| `ensemble` | 在固定权重融合基础上改写为 User/Session-Adaptive Ensemble：先用调参权重作为全局 base，再根据用户历史长度、序列长度、近期行为集中度和当前 session 信号动态修正权重。 | 融合不再是同一数据集所有用户共用完全相同的权重，更适合冷启动、长历史用户和当前行为明显变化的场景。 |

说明：不同算法的原始 score 含义不同，不能直接横向比较。例如 `popularity` 的 score 是热门度累计值，`bpr_mf` 的 score 是矩阵分解预测偏好，`ensemble` 的 score 是归一化后的加权融合分。

### 3.1 算法改写与调参细节

本项目没有提出全新的论文级模型结构，算法主体来自推荐系统中的经典方法。为了加强算法本身的改写，最终后端重点加入了两个明确的算法改动：`itemcf` 改为 Time-aware Rating-weighted ItemCF，`ensemble` 改为 User/Session-Adaptive Ensemble。它们不是全新的 SOTA 模型，但改动发生在相似度计算公式、用户打分函数和融合权重函数本身，而不是只做前端展示或接口封装。

| 算法 | 自实现与改写点 | 调参方式和最终设置 |
|---|---|---|
| `popularity` | 没有调用外部推荐库，而是在训练集上自行统计物品分数。每条交互使用 `max(rating, 1.0)` 作为权重，得到加权热门度；代码还预留了 `half_life_days` 时间衰减参数，可以把较新的行为权重调高。 | 当前正式结果使用 `half_life_days=0.0`，即不启用时间衰减。它主要作为强基线参与对比和融合搜索；最终融合权重中 MovieLens 和 Movies_and_TV 都为 `0`，说明自动调参认为热门度信号对最终 NDCG@10 的边际收益不高。 |
| `itemcf` | 自行构建 item-item 共现关系，并把传统共现改为时间感知和评分加权。两个物品的共现贡献为 `rating_i^p * rating_j^p * exp(-|t_i-t_j|/tau_pair) / log2(3+history_len)`；相似度为 `co(i,j) / sqrt(strength_i * strength_j)`；给用户推荐时再乘以 `exp(-(now_u-t_i)/tau_user)`，使近期高分行为贡献更大。 | 最终使用 `max_user_history=50`、`topk_neighbors=100`、`user_recent_k=30`、`pair_window=50`、`pair_tau_days=365`、`user_tau_days=180`、`rating_power=1.0`。这组参数控制训练时间在当天可完成，同时让评分强度和时间衰减真实进入模型。 |
| `content_tfidf` | 自行读取 `info.jsonl` 的标题文本，并用 TF-IDF 建立物品文本向量。用户画像由近期高分历史物品的 TF-IDF 向量按评分加权求和得到，候选物品通过与用户画像的点积相似度打分。这里使用的是标题级浅层语义信息，不是剧情简介、BERT 或 LLM embedding。 | 固定参数为 `max_features=50000`、`max_user_history=80`、`ngram_range=(1,2)`、英文停用词过滤。融合调参后权重为 MovieLens `0.2`，Movies_and_TV `0`。这和整体指标一致：标题 TF-IDF 单模型效果较弱，尤其 Movies_and_TV 标题噪声更明显。 |
| `bpr_mf` | 使用 PyTorch 自实现矩阵分解模型，包括 user embedding、item embedding、user bias、item bias。训练样本来自正反馈交互；每个正样本在线随机采一个用户未正反馈过的负物品，优化 BPR pairwise ranking loss，使正物品分数高于负物品。 | 固定参数为 `factors=64`、`epochs=3`、`batch_size=2048`、`lr=1e-3`、`max_train_samples=500000`、`positive_threshold=4.0`。融合调参后权重为 MovieLens `0.2`，Movies_and_TV `0.4`，说明隐式反馈矩阵分解是两个数据集上的核心个性化信号之一。 |
| `gru4rec` | 使用 PyTorch 自实现序列推荐模型。用户历史按时间戳排序，只保留正反馈序列；模型结构为 item embedding + GRU + linear output，用历史前缀预测下一个正反馈物品，因此显式考虑交互时序。 | 固定参数为 `embedding_dim=64`、`hidden_dim=64`、`max_seq_len=50`、`epochs=3`、`batch_size=2048`、`lr=1e-3`、`max_train_samples=500000`。融合调参后权重为 MovieLens `0.4`，Movies_and_TV `0.2`，说明 MovieLens 上时序兴趣信号更有效。 |
| `ensemble` | 自实现融合层。先对每个基础模型在候选集上的分数做 min-max 归一化，再使用调参得到的数据集级 base weights。正式后端进一步加入用户级动态修正：短历史用户提高 `popularity/content_tfidf`，长历史用户提高 `itemcf/bpr_mf`，长序列用户提高 `gru4rec`，当前 session 有搜索或加片单行为时提高 `itemcf/content_tfidf`。 | base weights 仍来自 `NDCG@10` 自动网格搜索；在线推荐时实际权重会随用户和 session 变化。MovieLens 全量重评后 `ensemble NDCG@10` 从约 `0.8161` 提升到 `0.8304`。Movies_and_TV 全量重评在本地超时，我只确认了 1000-case 抽样 `NDCG@10=0.6243`，不能把它当完整正式结果。 |

## 4. 算法推荐 Case

下面 case 使用同一个用户 ID 分别输入所有算法，展示各算法 Top-3 推荐结果。case 结果来自当前本地 `backend/saved_models/` 中的已训练模型。运行时本地 Python 对 `content_tfidf` 的 pickle 加载给出过 scikit-learn 版本不一致警告，因此如果换环境重新加载，`content_tfidf` 的个别浮点分数可能略有不同；离线指标表以 `backend/results/*.csv` 为准。

### Case A：MovieLens，用户 ID = `49305`

该用户本地训练/验证历史记录数为 7487。

| 算法 | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| `ensemble` | Interstellar (2014), score 0.5946 | Grand Budapest Hotel, The (2014), score 0.5871 | Inside Out (2015), score 0.5813 |
| `popularity` | Interstellar (2014), score 37385.5000 | The Martian (2015), score 27292.0000 | Wolf of Wall Street, The (2013), score 25889.0000 |
| `itemcf` | Tongues Untied (1989), score 2.7733 | Tokyo Olympiad (1965), score 2.0120 | A Summer at Grandpa's (1984), score 1.7689 |
| `content_tfidf` | Almost You (1985), score 6.7317 | Always (1985), score 6.7317 | Thrust in Me (1985), score 6.7317 |
| `bpr_mf` | Interstellar (2014), score 11.7004 | The Imitation Game (2014), score 10.6418 | The Martian (2015), score 10.3594 |
| `gru4rec` | Looper (2012), score 1.4813 | Silver Linings Playbook (2012), score 1.4619 | Black Panther (2017), score 1.4402 |

### Case B：Movies_and_TV，用户 ID = `A328S9RN3U5M68`

该用户本地训练/验证历史记录数为 2061。

| 算法 | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| `ensemble` | American Sniper 2014, score 0.8095 | Jurassic World, score 0.6900 | John Wick, score 0.6687 |
| `popularity` | Guardians of the Galaxy, score 33242.0000 | John Adams, score 26010.0000 | Guardians Of The Galaxy Region Free, score 25426.0000 |
| `itemcf` | Castle: Season 1-5 (2013), score 0.4322 | Racing Hearts, score 0.3891 | American Sign Language for Kids and Adults; Volume 1 2 Discs, score 0.3343 |
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
| `ensemble` | 0.9721 | 0.0972 | 0.9721 | 0.8304 | 0.7843 |
| `gru4rec` | 0.9614 | 0.0961 | 0.9614 | 0.7556 | 0.6890 |
| `bpr_mf` | 0.9602 | 0.0960 | 0.9602 | 0.7538 | 0.6869 |
| `popularity` | 0.9656 | 0.0966 | 0.9656 | 0.7532 | 0.6844 |
| `itemcf` | 0.7688 | 0.0769 | 0.7688 | 0.7062 | 0.6850 |
| `content_tfidf` | 0.3873 | 0.0387 | 0.3873 | 0.2159 | 0.1634 |

结论：MovieLens 上 `ensemble` 的 NDCG@10 和 MRR@10 最高，说明融合后不仅命中率高，而且正例位置更靠前。Time-aware ItemCF 和 Adaptive Ensemble 后端更新后，MovieLens 的 `ensemble NDCG@10` 从旧结果约 0.8161 提升到 0.8304。`content_tfidf` 明显较低，主要原因是当前内容特征主要来自标题，信息量有限。

### Movies_and_TV：`pos4`，100 negatives，K=10

下面表格是上一次全量正式评测结果。后端已重训 Time-aware ItemCF，但 Movies_and_TV 的新全量重评在本地 1 小时超时，没有完成；我只完成了 1000-case 抽样检查，`ensemble NDCG@10=0.6243`，因此这里不把抽样结果替代正式全量表。

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

基础权重来自调参 CSV 中 `rank = 1` 且 `k = 10` 的记录。后端在线推荐时会在基础权重上继续做用户级和 session 级动态修正，因此每个用户请求的实际融合权重可能不同。

| 数据集 | Base weights | 调参目标分数 |
|---|---|---:|
| MovieLens | `popularity=0,itemcf=0.2,content_tfidf=0.2,bpr_mf=0.2,gru4rec=0.4` | 0.8347 |
| Movies_and_TV | `popularity=0,itemcf=0.4,content_tfidf=0,bpr_mf=0.4,gru4rec=0.2` | 0.6206 |

对应的基础权重文件内容可以概括为：

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

API 的 `ensemble` 支持通过 `weights` 参数手动传入权重；如果不传权重，后端会使用上述数据集级 base weights，并在请求时根据用户历史和 session 信号做动态修正。

## 8. 分工

| 成员 | 分工 |
|---|---|
| 董雨欣 | 推荐算法实现；训练、评测、调参脚本实现；前后端微调；demo experiment 部分。 |
| 王清清 | 前端 UI 的设计和实现；前端与后端数据衔接的 API 设计；demo store 部分。 |

具体内容可以见 GitHub 页面 commit 记录。
